const puppeteer = require("puppeteer");
const fetch = require("node-fetch");
const fs = require("fs");

(async () => {
	try {
		// Dynamically import ora
		const ora = await import("ora");
		const { default: chalk } = await import("chalk");
		const spinner = ora.default("Fetching data from Lexus website...").start();

		// Fetch data from the API endpoint
		const response = await fetch("https://lexus.jp/magazine/json/all_contents.json");
		const jsonData = await response.json();

		// Log the number of pages to be scraped
		const totalPages = jsonData.ContentsList.length;
		spinner.succeed(`Found ${totalPages} posts to scrape.`);

		// Array to store scraped data
		let data = [];

		for (let i = 0; i < totalPages; i++) {
			const content = jsonData.ContentsList[i];
			const browser = await puppeteer.launch();
			const page = await browser.newPage();

			// Construct full URL of the page
			const pageURL = `https://lexus.jp${content.PageURL}`;

			spinner.start(`Scraping post ${i + 1}/${totalPages}: ${pageURL}`);

			// Navigate to the page
			await page.goto(pageURL, { timeout: 60000 });

			// Check if all required selectors are present
			const isAllSelectorsPresent = await page.evaluate(() => {
				return document.querySelector(".section-slider") && document.querySelector(".article__body") && document.querySelector(".article__head");
			});

			if (!isAllSelectorsPresent) {
				spinner.warn("Skipping post due to missing required elements.");
				await browser.close();
				continue; // Skip to the next page
			}

			// Wait for all selectors simultaneously
			await Promise.all([page.waitForSelector(".section-slider"), page.waitForSelector(".article__body"), page.waitForSelector(".article__head")]);

			// Extract the relative path of the image from the meta tag
			const featureImagePath = await page.evaluate(() => {
				const metaElement = document.querySelector('meta[property="og:image"]');
				if (metaElement) {
					const imageUrl = metaElement.getAttribute("content");
					// Remove the domain part from the URL
					const domainIndex = imageUrl.indexOf("https://lexus.jp");
					if (domainIndex !== -1) {
						return imageUrl.substring(domainIndex + "https://lexus.jp".length);
					} else {
						return imageUrl; // If the domain part is not found, return the full URL
					}
				}
				return null; // If metaElement is not found
			});

			let featureImage = null;

			if (featureImagePath) {
				// Construct the complete URL using the base URL of the website
				featureImage = {
					url: featureImagePath,
					alt: "", // You can set alt text to an empty string as it's not available in meta tags
				};
			}

			// Extract content from article__text-area, article__image, article__slider, and article__heading inside article__body
			const title = await page.evaluate(() => {
				const headElement = document.querySelector(".article__head");
				const content = headElement.querySelector(".article__lead").innerText.trim();

				return {
					content,
				};
			});

			// Extract content from the page
			const fields = await page.evaluate(() => {
				const fieldsData = [];
				const articleBody = document.querySelector(".article__body");

				// Get all elements with classes relevant for mapping
				const relevantElements = Array.from(articleBody.querySelectorAll(".article__image, .article__text-area, .article__heading, .article__slider"));

				// Sort elements based on their appearance in the HTML structure
				relevantElements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

				relevantElements.forEach((element) => {
					const className = element.classList.contains("article__slider") ? "article__slider" : element.className;

					switch (className) {
						case "article__image": {
							const imageUrl = element.querySelector("img").getAttribute("data-srcset");
							const imageHeight = element.querySelector("img").height;
							const imageWidth = element.querySelector("img").width;
							fieldsData.push({
								fieldId: "image",
								image: {
									url: imageUrl,
									height: imageHeight,
									width: imageWidth,
								},
							});
							break;
						}
						case "article__text-area": {
							fieldsData.push({
								fieldId: "richText",
								content: element.innerHTML.trim(),
							});
							break;
						}
						case "article__heading": {
							fieldsData.push({
								fieldId: "heading",
								content: element.innerText.trim(),
							});
							break;
						}
						case "article__slider": {
							const carouselItems = [];
							element.querySelectorAll(".slick-slide").forEach((item) => {
								const caption = item.querySelector("[data-caption]").getAttribute("data-caption");
								const imageUrl = item.querySelector("img").getAttribute("data-srcset");
								const imageHeight = item.querySelector("img").height;
								const imageWidth = item.querySelector("img").width;
								carouselItems.push({
									image: {
										url: imageUrl,
										height: imageHeight,
										width: imageWidth,
									},
									text: caption,
								});
							});
							fieldsData.push({
								fieldId: "carousel",
								items: carouselItems,
							});
							break;
						}
						default:
							break;
					}
				});

				return fieldsData;
			});

			data.push({
				post_url: content.PageURL,
				featureImage,
				title,
				content: [...fields],
			});

			// Save scraped data to a JSON file
			const filePath = "scraped_data.json";
			fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
				if (err) {
					console.error("Error saving scraped data to file:", err);
				} else {
					console.log("Scraped data saved to file:", filePath);
				}
			});

			spinner.succeed(`Scraped post ${i + 1}/${totalPages}: ${chalk.green("✔")} ${pageURL}`); // Use chalk for text highlighting
			await browser.close();
		}

		res.json(data);
	} catch (error) {
		console.error("Error scraping data:", error);
		res.status(500).send("Error scraping data");
	}
})();
