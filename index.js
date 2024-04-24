const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Read cookies from cookies.txt file
const cookies = fs.readFileSync('cookies.txt', 'utf8').trim();

async function getYoutubeTitle(link) {
    try {
        const response = await axios.get(link, {
            headers: {
                'Cookie': cookies
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);

        const title = $('meta[property="og:title"]').attr('content');

        if (title) {
            return title;
        } else {
            throw new Error('Title not found');
        }
    } catch (error) {
        console.error('Error fetching video title:', error);
        throw error;
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const libraryPath = path.join(__dirname, 'library.json');

app.get('/api/jonell', async (req, res) => {
    try {
        const { url: videoUrl } = req.query;

        const videoTitle = await getYoutubeTitle(videoUrl);
        const instance = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            baseURL: 'https://www.cjoint.com/',
        });

        const uploadUrl = await getUploadUrl(instance);
        const outputPath = path.join(__dirname, `${videoTitle}.m4a`);

        await downloadFile(videoUrl, outputPath);

        const uploadResponse = await uploadFile(outputPath, uploadUrl, instance);
        const cjointLink = await getCjointLink(uploadResponse);
        const finalUrl = await getFinalUrl(cjointLink);

        const jsonResponse = {
            Successfully: {
                url: finalUrl,
                src: `${videoTitle}.m4a`,
                title: videoTitle,
                ytLink: videoUrl,
                status: 'Success'
            }
        };

        addToLibrary(jsonResponse.Successfully);

        res.json(jsonResponse);

        fs.unlink(outputPath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('File deleted successfully');
            }
        });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send('Error processing video');
    }
});

app.get('/api/library', async (req, res) => {
    try {
        const data = await fs.promises.readFile(libraryPath, 'utf8');
        const library = JSON.parse(data);
        res.json(library);
    } catch (error) {
        console.error('Error reading library:', error);
        res.status(500).send('Error reading library');
    }
});

function addToLibrary(data) {
    let library = [];

    if (fs.existsSync(libraryPath)) {
        const existingData = fs.readFileSync(libraryPath, 'utf8');
        library = JSON.parse(existingData);
    }

    library.push(data);

    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf8');
}

async function getUploadUrl(instance) {
    const response = await instance.get('/');
    const $ = cheerio.load(response.data);
    return $('#form-upload').attr('action');
}

async function downloadFile(url, outputPath) {
    const response = await axios.get(`https://ytdlbyjonell-0c2a4d00cfcc.herokuapp.com/yt?url=${encodeURIComponent(url)}&type=mp4`, {
        responseType: 'arraybuffer',
    });

    fs.writeFileSync(outputPath, Buffer.from(response.data, 'binary'));
}

async function uploadFile(filePath, uploadUrl, instance) {
    const formData = new FormData();
    formData.append('USERFILE', fs.createReadStream(filePath));

    const response = await instance.post(uploadUrl, formData, {
        headers: formData.getHeaders(),
    });
    return response.data;
}

async function getCjointLink(uploadResponse) {
    const $ = cheerio.load(uploadResponse);
    const link = $('.share_url a').attr('href');
    console.log('Cjoint link:', link);  // Log the extracted cjoint link
    return link;
}

async function getFinalUrl(cjointLink) {
    const instance = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        baseURL: cjointLink,
    });

    try {
        const htmlResponse = await instance.get('/');
        const html$ = cheerio.load(htmlResponse.data);
        const shareUrl = html$('.share_url a').attr('href');
        console.log('Share URL:', shareUrl);  // Log the extracted share URL
        const finalUrl = `https://www.cjoint.com${shareUrl.split('"')[0]}`;
        return finalUrl;
    } catch (error) {
        console.error('Error getting final URL:', error);
        throw error;
    }
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
