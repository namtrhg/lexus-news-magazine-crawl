const puppeteer = require("puppeteer");
const fs = require("fs").promises;

const pagePath = process.argv[2];

if (!pagePath) {
	console.error("No page URL provided. Usage: node scrape.js /magazine/post/abc");
	process.exit(1);
}

const pageURL = `https://lexus.jp${pagePath}`;

(async () => {
	try {
		const ora = await import("ora");
		const spinner = ora.default("Fetching data from the Lexus website...").start();
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		await page.goto(pageURL, { waitUntil: "networkidle0" });
		spinner.start(`Scraping post: ${pageURL}`);

		const content = await extractContent(page);
		const data = {
			[pagePath]: {
				post_url: pageURL.replace('https://lexus.jp', ''),
				featureImage: content.featureImage,
				title: content.title,
				credit: content.credit,
				content: content.contentDetails,
				note: content.note,
				profiles: content.profiles,
			},
		};
		// Save to a JSON file
		const filePath = "scraped_post.json";
		await fs.writeFile(filePath, JSON.stringify(data, null, 2));
		spinner.succeed(`Successfully scraped post: ${pageURL}`);
		spinner.succeed(`Data saved to ${filePath}`);
		await page.close();
		await browser.close();
	} catch (error) {
		console.error("Critical error occurred:", error);
		process.exit(1);
	}
})();

async function extractContent(page) {
	const featureImage = await page.evaluate(() => {
		const metaElement = document.querySelector('meta[property="og:image"]');
		return {
			url: metaElement ? metaElement.getAttribute("content").replace('https://lexus.jp', '') : "",
			alt: "",
		};
	});

	const title = await page.evaluate(() => {
		const titleElement = document.querySelector(".article__head .article__lead");
		return titleElement ? titleElement.innerText.trim() : "";
	});

	const credit = await page.evaluate(() => {
		const creditElement = document.querySelector(".article__head .article__credit");
		return creditElement ? creditElement.innerText.trim() : "";
	});

	const note = await page.evaluate(() => {
		const noteElement = document.querySelector(".article__foot .note__text");
		return noteElement ? noteElement.innerText.trim() : "";
	});

	const profiles = await page.evaluate(() => {
		return Array.from(document.querySelectorAll(".profile")).map((profile) => ({
			image: profile.querySelector("img")?.src,
			name: profile.querySelector(".profile__name")?.innerText.trim(),
			description: profile.querySelector(".profile__text")?.innerText.trim(),
		}));
	});

	const contentDetails = await page.evaluate(() => {
		const articleBody = document.querySelector(".article__body");
		if (!articleBody) return [];

		const elements = articleBody.querySelectorAll(
			".article__image, .article__text-area, .article__heading, .article__slider, .article__movie, .article__html, .article__moduleBanner, .profile",
		);
		const details = Array.from(elements).map((element) => {
			if (element.classList.contains("article__image")) {
				const img = element.querySelector("img");
				const caption = element.querySelector("figcaption.article__caption")?.innerText.trim() || "";
				return {
					fieldId: "image",
					image: {
						url: img?.getAttribute("data-srcset").replace('https://lexus.jp', ''),
						height: img?.naturalHeight,
						width: img?.naturalWidth,
						alt: img?.alt,
						caption: caption,
					},
				};
			} else if (element.classList.contains("article__text-area")) {
				const isHtmlParent = element.closest(".article__html") != null;
				if (!isHtmlParent)
					return {
						fieldId: "richText",
						content: element.innerHTML,
					};
				else return undefined;
			} else if (element.classList.contains("profile")) {
				return {
					fieldId: "html",
					content: element.innerHTML,
				};
			} else if (element.classList.contains("article__heading")) {
				return {
					fieldId: "heading",
					content: element.innerText,
				};
			} else if (element.classList.contains("vsw-audio_source")) {
				return {
					fieldId: "audio",
					url: audioElement.src.replace('https://lexus.jp', ''),
				};
			} else if (element.classList.contains("article__html")) {
				if (element.querySelector(".article__moduleBanner")) {
					const aTag = element.querySelector("a");
					const imgTag = aTag.querySelector("img");
					return {
						fieldId: "banner",
						url: aTag.href,
						image: {
							src: imgTag.src.replace('https://lexus.jp', ''),
							alt: imgTag.alt,
						},
					};
				} else {
					return {
						fieldId: "html",
						content: element.innerHTML,
					};
				}
			} else if (element.classList.contains("article__slider")) {
				return {
					fieldId: "carousel",
					items: Array.from(element.querySelectorAll(".slick-slide img")).map((img) => ({
						image: {
							url: img.getAttribute("data-srcset").replace('https://lexus.jp', ''),
							height: img.naturalHeight,
							width: img.naturalWidth,
						},
						text: img.alt,
						isHidden: img.closest(".slick-cloned") !== null, // Check if the img is inside a .slick-cloned element
					})),
				};
			} else if (element.classList.contains("article__movie")) {
				const video = element.querySelector(".article__iframe");
				const thumbnailImage = element.querySelector(".article__movie-thumb img");
				const caption = element.querySelector(".article__movie .article__caption");
				return {
					fieldId: "video",
					videoUrl: video?.src.replace('https://lexus.jp', ''),
					thumbnail: {
						url: thumbnailImage?.src.replace('https://lexus.jp', '') ?? "",
						alt: thumbnailImage?.alt ?? "",
					},
					isHalf: element.classList.contains("size-half"),
					caption: caption.innerText,
				};
			} else {
				console.log("Found unrecognized element:", element);
				return undefined;
			}
		});
		return details.filter((detail) => detail !== null && detail !== undefined);
	});

	return {
		featureImage,
		title,
		credit,
		note,
		profiles,
		contentDetails,
	};
}
