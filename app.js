const aws = require('aws-sdk');
const puppeteer = require('puppeteer');

const {
  S3_ACCESS_KEY,
  S3_SECRET_ACCESS_KEY,
  S3_ENDPOINT,
  S3_BUCKET_NAME,
} = process.env;

aws.config.update({
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRET_ACCESS_KEY
});

const s3 = new aws.S3({
  endpoint: new aws.Endpoint(S3_ENDPOINT),
});

const store = async (browser, post) => {
  const url = new URL(post['post_url']).pathname.split('/').splice(1);

  url[2] = url[2].replace('.html', '');

  const urlString = url.join('/');

  const images = [
    {
      filename: `ss/${urlString}/default.png`,
      content_type: 'image/png',
      options: {
        type: 'png',
      },
    },
    {
      filename: `ss/${urlString}/default.jpeg`,
      content_type: 'image/jpeg',
      options: {
        type: 'jpeg',
        quality: 100,
      },
    },
    {
      filename: `ss/${urlString}/default@2x.jpeg`,
      content_type: 'image/jpeg',
      options: {
        type: 'jpeg',
        quality: 75,
      },
    },
    {
      filename: `ss/${urlString}/default@3x.jpeg`,
      content_type: 'image/jpeg',
      options: {
        type: 'jpeg',
        quality: 50,
      },
    },
    {
      filename: `ss/${urlString}/default@4x.jpeg`,
      content_type: 'image/jpeg',
      options: {
        type: 'jpeg',
        quality: 25,
      },
    },
  ];

  const page = await browser.newPage();

  await page.setViewport({
    width: 768,
    height: 480,
    deviceScaleFactor: 1,
  });

  await page.goto(post['post_url']);

  for (const image of images) {
    const imgSrc = await page.screenshot({
      ...image.options,
      fullPage: true,
      omitBackground: true,
      encoding: 'binary',
    });

    await s3.putObject({
      ACL: 'public-read',
      Key: image.filename,
      Bucket: S3_BUCKET_NAME,
      Body: imgSrc,
      ContentType: image.content_type,
      Metadata: {
        'chord-id': post['chord_id'],
        'artist-id': post['artist_id'],
        'blog-id': post['blog_id'],
        'post-id': post['post_id'],
        'post-url': post['post_url'],
        'original-post-url': post['original_post_url'],
        'post-title': post['title'],
        'post-artist': post['artist'],
      },
    }, (err, data) => {
      if (err) {
        console.log(post['post_url']);
      }
    });
  }
}

(async () => {
  const data = require('./data.json');
  const chunk = 10;

  for (let i = 0, j = data.length; i < j; i += chunk) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    });

    const posts = data.slice(i, i + chunk);

    for (const post of posts) {
      await store(browser, post);
    }

    await browser.close();
  }
})();
