const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const rawData = fs.readFileSync("scraped_data.json");
const data = JSON.parse(rawData);
const AWS = require("aws-sdk");
require("dotenv").config();

// Configure AWS with your access key, secret key, and region
AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

(async () => {
	try {
		const ora = await import("ora");
		const { default: chalk } = await import("chalk");
		let totalSuccessMessages = 0;

		const uploadImageToS3 = async (mediaUrl, filePath, postUrl, spinner, type) => {
			try {
				const fullUrl = mediaUrl.startsWith("https://lexus.jp") ? mediaUrl : `https://lexus.jp${mediaUrl}`;
				const response = await fetch(fullUrl);
				const buffer = await response.buffer();

				// Setting up S3 upload parameters
				const params = {
					Bucket: process.env.AWS_BUCKET,
					Key: filePath,
					Body: buffer,
					ContentType: type,
				};

				// Uploading files to the bucket
				await s3.upload(params).promise();
				return true;
			} catch (error) {
				spinner.fail(`✘ Error uploading image to S3 from ${postUrl}: ${error.message}`);
				return false;
			}
		};

		const createDirectories = (mediaUrl) => {
			const sanitizedMediaUrl = mediaUrl.replace("https://lexus.jp", "");
			const directoryPath = path.join("media", sanitizedMediaUrl.replace(/^\/|\/$/g, ""));
			return directoryPath;
		};

		for (const post of data) {
			const postUrl = `https://lexus.jp${post.post_url}`;
			const mediaToDownload = [];
			let successMessages = 0;

			if (!post.content || !Array.isArray(post.content)) {
				console.error(chalk.yellow(`Skipping post due to invalid content format: ${postUrl}`));
				continue;
			}

			for (const field of post.content) {
				if (field) {
					switch (field.fieldId) {
						case "image":
							mediaToDownload.push({ url: field.image.url, type: "image/jpeg" });
							break;
						case "banner":
							mediaToDownload.push({ url: field.image.src, type: "image/jpeg" });
							break;
						case "carousel":
							field.items.forEach((item) => mediaToDownload.push({ url: item.image.url, type: "image/jpeg" }));
							break;
						case "html":
							const $ = cheerio.load(field.content);
							$("img").each(function () {
								mediaToDownload.push({ url: $(this).attr("srcset") ?? $(this).attr("src"), type: "image/jpeg" });
							});
							$("video").each(function () {
								const videoSrc = $(this).attr("src");
								if (videoSrc) {
									mediaToDownload.push({ url: $(this).attr("src"), type: "video/mp4" });
								}
							});
							break;
					}
				}
			}

			const spinner = ora.default(`Downloading media from ${postUrl}`).start();
			const totalImages = mediaToDownload.length;

			for (let i = 0; i < totalImages; i++) {
				const media = mediaToDownload[i];
				const mediaDirectory = createDirectories(path.dirname(media.url));
				const mediaPath = path.join(mediaDirectory, path.basename(media.url));
				const downloaded = await uploadImageToS3(media.url, mediaPath, postUrl, spinner, media.type);
				if (downloaded) {
					successMessages++;
					spinner.text = `Media downloaded (${successMessages}/${totalImages}) from ${chalk.blue(media.url)} at ${chalk.blue(postUrl)}`;
				}
			}

			spinner.succeed(`All media downloaded (${successMessages}/${totalImages}) from ${chalk.blue(postUrl)}`);
			totalSuccessMessages += successMessages;
		}

		console.log(chalk.green(`Total ${totalSuccessMessages} media downloaded successfully!`));
	} catch (error) {
		console.error("Failed to download media", error);
	}
})();
