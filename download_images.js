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
                // Check if the imageUrl already includes the 'https://lexus.jp' base, if not, prepend it
                const fullUrl = imageUrl.startsWith('https://lexus.jp') ? imageUrl : `https://lexus.jp${imageUrl}`;
        
                // Fetch the image from the fullUrl
                const response = await fetch(fullUrl);
        
                // Check if the fetch was successful
                if (!response.ok) {
                    throw new Error(`HTTP status ${response.status}`);
                }
        
                // Convert the response data to a Buffer object
                const buffer = await response.buffer();
        
                // Use the file system module (fs) to write the Buffer to a file
                fs.writeFileSync(filePath, buffer);
        
                // Indicate successful completion
                return true;
            } catch (error) {
                // If an error occurs, log it and display a failure message using the spinner
                spinner.fail(chalk.red(`✘ Error downloading image from ${postUrl}: ${error.message}`));
        
                // Return false to indicate failure
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
                } 
                else if (field.fieldId === "banner") {
                    imagesToDownload.push(field.image.src);
                }
                else if (field.fieldId === "carousel") {
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
