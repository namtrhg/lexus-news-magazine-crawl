const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const rawData = fs.readFileSync("scraped_data.json");
const data = JSON.parse(rawData);
const AWS = require("aws-sdk");
require('dotenv').config();

// Configure AWS with your access key, secret key, and region
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

(async () => {
	try {
		const ora = await import("ora");
		const { default: chalk } = await import("chalk");
		let totalSuccessMessages = 0;

		const uploadImageToS3 = async (imageUrl, filePath, postUrl, spinner) => {
			try {
				const fullUrl = imageUrl.startsWith("https://lexus.jp") ? imageUrl : `https://lexus.jp${imageUrl}`;
				const response = await fetch(fullUrl);
				const buffer = await response.buffer();

				// Setting up S3 upload parameters
				const params = {
					Bucket: process.env.AWS_BUCKET,
					Key: filePath,
					Body: buffer,
					ContentType: "image/jpeg", // You might want to adjust this based on the actual image MIME type
				};

				// Uploading files to the bucket
				await s3.upload(params).promise();
				return true;
			} catch (error) {
				spinner.fail(`✘ Error uploading image to S3 from ${postUrl}: ${error.message}`);
				return false;
			}
		};

		const createDirectories = (imageUrl) => {
			// Remove the domain part if it exists in the imageUrl
			const sanitizedImageUrl = imageUrl.replace("https://lexus.jp", "");
			const directoryPath = path.join("images", sanitizedImageUrl.replace(/^\/|\/$/g, ""));
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
					switch (field.fieldId) {
						case "image":
							imagesToDownload.push(field.image.url);
							break;
						case "banner":
							imagesToDownload.push(field.image.src);
							break;
						case "carousel":
							field.items.forEach((item) => {
								imagesToDownload.push(item.image.url);
							});
							break;
						case "html":
							const $ = cheerio.load(field.content);
							$("img").each(function () {
								const imgSrc = $(this).attr("src");
								if (imgSrc) {
									const fullImgSrc = imgSrc.startsWith("http") ? imgSrc : `https://lexus.jp${imgSrc}`;
									imagesToDownload.push(fullImgSrc);
								}
							});
							break;
					}
				}
			}

			const spinner = ora.default(`Downloading images from ${postUrl}`).start();
			const totalImages = imagesToDownload.length;

			for (let i = 0; i < totalImages; i++) {
				const imageUrl = imagesToDownload[i];
				const imageDirectory = createDirectories(path.dirname(imageUrl));
				const downloaded = await uploadImageToS3(imageUrl, imageDirectory, postUrl, spinner);
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
