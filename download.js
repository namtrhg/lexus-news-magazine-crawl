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
                const response = await fetch(`https://lexus.jp${imageUrl}`);
                const buffer = await response.buffer();
                fs.writeFileSync(filePath, buffer);
                return true;
            } catch (error) {
                spinner.fail(chalk.red(`✘ Error downloading image from ${postUrl}: ${error.message}`));
                return false;
            }
        };

        const createDirectories = (imageUrl) => {
            const directoryPath = path.join(__dirname, "images", imageUrl.replace(/^\/|\/$/g, ""));
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath, { recursive: true });
            }
            return directoryPath;
        };

        for (const post of data) {
            const postUrl = `https://lexus.jp${post.post_url}`;
            const imagesToDownload = [];
            let successMessages = 0;

            for (const field of post.content) {
                if (field.fieldId === "image") {
                    imagesToDownload.push(field.image.url);
                } else if (field.fieldId === "carousel") {
                    for (const item of field.items) {
                        imagesToDownload.push(item.image.url);
                    }
                }
            }

            const spinner = ora.default(`Downloading images from ${postUrl}`).start();
            const totalImages = imagesToDownload.length;
            for (let i = 0; i < imagesToDownload.length; i++) {
                const imageUrl = imagesToDownload[i];
                const imageDirectory = createDirectories(path.dirname(imageUrl));
                const imagePath = path.join(imageDirectory, `${path.basename(imageUrl)}`);
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
