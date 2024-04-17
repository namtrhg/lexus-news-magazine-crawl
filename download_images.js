const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const rawData = fs.readFileSync("scraped_data.json");
const data = JSON.parse(rawData);

(async () => {
	try {
		const ora = await import("ora");
		const { default: chalk } = await import("chalk");
		let totalSuccessMessages = 0;

		const downloadImage = async (imageUrl, filePath, postUrl, spinner) => {
			try {
				const fullUrl = imageUrl.startsWith("https://lexus.jp") ? imageUrl : `https://lexus.jp${imageUrl}`;
				const response = await fetch(fullUrl);
				const buffer = await response.buffer();
				fs.writeFileSync(filePath, buffer);
				return true;
			} catch (error) {
				spinner.fail(chalk.red(`✘ Error downloading image from ${postUrl}: ${error.message}`));
				return false;
			}
		};

		const createDirectories = (imageUrl) => {
			// Remove the domain part if it exists in the imageUrl
			const sanitizedImageUrl = imageUrl.replace("https://lexus.jp", "");
			const directoryPath = path.join(__dirname, "images", sanitizedImageUrl.replace(/^\/|\/$/g, ""));
			if (!fs.existsSync(directoryPath)) {
				fs.mkdirSync(directoryPath, { recursive: true });
			}
			return directoryPath;
		};

		for (const post of data) {
			const postUrl = `https://lexus.jp${post.post_url}`;
			const imagesToDownload = [];
			let successMessages = 0;

			if (!post.content || !Array.isArray(post.content)) {
				console.error(chalk.yellow(`Skipping post due to invalid content format: ${postUrl}`));
				continue;
			}

			for (const field of post.content) {
				if (field && field.fieldId) {
					if (field.fieldId === "image") {
						imagesToDownload.push(field.image.url);
					} else if (field.fieldId === "banner") {
						imagesToDownload.push(field.image.src);
					} else if (field.fieldId === "carousel") {
						for (const item of field.items) {
							imagesToDownload.push(item.image.url);
						}
					}
				}
			}

			const spinner = ora.default(`Downloading images from ${postUrl}`).start();
			const totalImages = imagesToDownload.length;

			for (let i = 0; i < totalImages; i++) {
				const imageUrl = imagesToDownload[i];
				const imageDirectory = createDirectories(path.dirname(imageUrl));
				const imagePath = path.join(imageDirectory, path.basename(imageUrl));
				const downloaded = await downloadImage(imageUrl, imagePath, postUrl, spinner);
				if (downloaded) {
					successMessages++;
					spinner.text = `Image downloaded (${successMessages}/${totalImages}) from ${chalk.blue(postUrl)}`;
				}
			}

			spinner.succeed(`All images downloaded (${successMessages}/${totalImages}) from ${chalk.blue(postUrl)}`);
			totalSuccessMessages += successMessages;
		}

		console.log(chalk.green(`Total ${totalSuccessMessages} images downloaded successfully!`));
	} catch (error) {
		console.error("Failed to download images", error);
	}
})();
