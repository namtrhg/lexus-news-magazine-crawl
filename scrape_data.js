const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs").promises;

(async () => {
	try {
		const ora = await import("ora");
		const spinner = ora.default("Fetching data from the Lexus website...").start();

		const response = await fetch("https://lexus.jp/magazine/json/all_contents.json");
		if (!response.ok) {
			throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
		}
		const jsonData = await response.json();
		const totalPages = jsonData.ContentsList.length;
		spinner.succeed(`Found ${totalPages} posts to scrape.`);

		const data = [];
		const browser = await puppeteer.launch();
		const context = browser.defaultBrowserContext();
		await context.overridePermissions("https://lexus.jp", ["geolocation", "notifications"]); // Override permissions

		async function processPage(content, index, totalPages) {
			const page = await browser.newPage();
			const pageURL = `https://lexus.jp${content.PageURL}`;
			spinner.start(`Scraping post ${index + 1}/${totalPages}: ${pageURL}`);

			try {
				await page.goto(pageURL, { waitUntil: "networkidle0", timeout: 80000 });
				await page.waitForSelector(".article__body", { timeout: 5000 });

				if (page.url() !== pageURL) {
					spinner.warn(`Redirected from ${pageURL} to ${page.url()}`);
					await page.close();
					return;
				}

				// Place all evaluations inside a try-catch block
				try {
					const profiles = await page.evaluate(() => {
						const profiles = Array.from(document.querySelectorAll(".article__foot .profile")).map((profile) => ({
							image: profile.querySelector(".profile__image img")?.srcset || null,
							name: profile.querySelector(".profile__name")?.innerText.trim() || "Name not found",
							description: profile.querySelector(".profile__text")?.innerText.trim() || "Description not available",
						}));
						return profiles;
					});

					const featureImage = await page.evaluate(() => {
						const metaElement = document.querySelector('meta[property="og:image"]');
						return { url: metaElement?.getAttribute("content") || "Image not found", alt: "" };
					});

					const title = await page.evaluate(() => {
						const leadText = document.querySelector(".article__head .article__lead");
						return leadText ? leadText.innerText.trim() : "No title";
					});

					const contentDetails = await page.evaluate(() => {
						const articleBody = document.querySelector(".article__body");
						if (!articleBody) return [];

						const elements = articleBody.querySelectorAll(
							".article__image, .article__text-area, .article__heading, .article__slider, .article__movie, .article__html, .article__moduleBanner",
						);
						return Array.from(elements).map((element) => {
							if (element.classList.contains("article__image")) {
								const img = element.querySelector("img");
								const caption = element.querySelector("figcaption.article__caption")?.innerText.trim() || "Caption not available";
								return {
									fieldId: "image",
									image: {
										url: img?.getAttribute("data-srcset"),
										height: img?.naturalHeight,
										width: img?.naturalWidth,
										alt: img?.alt,
										caption: caption
									},
								};
							} else if (element.classList.contains("article__text-area")) {
								return {
									fieldId: "richText",
									content: element.innerHTML.trim(),
								};
							} else if (element.classList.contains("article__heading")) {
								return {
									fieldId: "heading",
									content: element.innerText.trim(),
								};
							} else if (element.classList.contains("vsw-audio_source")) {
								return {
									fieldId: "audio",
									url: audioElement.src,
								};
							} else if (element.classList.contains("article__html")) {
								if (element.querySelector(".article__moduleBanner")) {
									const aTag = element.querySelector("a");
									const imgTag = aTag.querySelector("img");
									return {
										fieldId: "banner",
										url: aTag.href,
										image: {
											src: imgTag.src,
											alt: imgTag.alt,
										},
									};
								} else {
									return {
										fieldId: "html",
										content: element.innerHTML.trim(),
									};
								}
							} else if (element.classList.contains("article__slider")) {
								return {
									fieldId: "carousel",
									items: Array.from(element.querySelectorAll(".slick-slide img")).map((img) => ({
										image: {
											url: img.getAttribute("data-srcset"),
											height: img.naturalHeight,
											width: img.naturalWidth,
										},
										text: img.alt,
										isHidden: img.closest(".slick-cloned") !== null, // Check if the img is inside a .slick-cloned element
									})),
								};
							} else if (element.classList.contains("article__movie")) {
								const video = element.querySelector(".article__iframe");
								return {
									fieldId: "video",
									videoUrl: video?.src,
									thumbnail: {
										url: video?.getAttribute("poster"), // Assuming 'poster' attribute holds thumbnail image URL
										alt: "Video thumbnail",
									},
									isHalf: element.classList.contains("size-half"),
								};
							}
						});
					});

					data.push({
						post_url: pageURL,
						featureImage,
						title,
						content: contentDetails,
						profiles,
					});
					await page.close();
					spinner.succeed(`Successfully scraped post ${index + 1}/${totalPages}: ${pageURL}`);
				} catch (evalError) {
					spinner.fail(`Failed to evaluate page content for ${pageURL}: ${evalError}`);
				}
			} catch (navError) {
				data.push({
					post_url: pageURL,
					redirectUrl: page.url(), // Adding the redirected URL to the data array
				});
				await page.close();
				spinner.warn(`Navigation failed for ${pageURL} which is redirected to ${page.url()}`);
			}

			// Save scraped data to a JSON file
			const filePath = "scraped_data.json";
			await fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
				if (err) {
					console.error("Error saving scraped data to file:", err);
				} else {
					console.log("Scraped data saved to file:", filePath);
				}
			});

			spinner.succeed(`Successfully scraped post ${index + 1}/${totalPages}: ${pageURL}`);
		}
		// Create promises for each set of 20 pages and wait for all of them to complete
		const chunkSize = 50;
		for (let i = 0; i < totalPages; i += chunkSize) {
			const promises = jsonData.ContentsList.slice(i, i + chunkSize).map((content, index) => processPage(content, i + index, totalPages));
			await Promise.all(promises);
		}

		// Save scraped data to a JSON file
		const filePath = "scraped_data.json";
		await fs.writeFile(filePath, JSON.stringify(data, null, 2));
		spinner.succeed(`All posts scraped and data saved to ${filePath}`);
		await browser.close();
	} catch (error) {
		console.error("Critical error occurred:", error);
		process.exit(1);
	}
})();
