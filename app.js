const aws = require('aws-sdk');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');

const {
  S3_ACCESS_KEY,
  S3_SECRET_ACCESS_KEY,
  S3_ENDPOINT,
  S3_BUCKET_NAME,
  BLOG_ID,
} = process.env;

aws.config.update({
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRET_ACCESS_KEY
});

const s3 = new aws.S3({
  endpoint: new aws.Endpoint(S3_ENDPOINT),
});

const posts = async (start = 1, limit = 10, orderBy = 'published') => {
  const baseUrl = `https://www.blogger.com/feeds/${BLOG_ID}/posts/default?alt=json`;
  const data = [];

  const {feed: {entry: entries}} = await fetch(`${baseUrl}&orderby=${orderBy}&max-results=${limit}&start-index=${start}`)
    .then(res => res.json())
    .then(data => data)
    .catch(e => console.error(e));

  for (const entry of entries) {
    const {id: {'$t': id}, published: {'$t': published}, updated: {'$t': updated}, title: {'$t': title}, link} = entry;
    const {0: blog_id, 1: post_id} = id.replace('tag:blogger.com,1999:blog-', '').replace('post-', '').split('.')
    const links = link.filter(i => i.type === 'text/html');

    if (links.length > 0) {
      const url = links[0].href;

      data.push({blog_id, post_id, published, updated, title, url});
    }
  }

  return data;
}

const store = async (browser, post) => {
  const url = new URL(post.url).pathname.split('/').splice(1);

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

  await page.goto(post.url);

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
        'blog-id': post.blog_id,
        'post-id': post.post_id,
        'post-url': post.url,
        'post-title': post.title,
        'post-published': post.published,
        'post-updated': post.updated,
      },
    }, (err, data) => {
      if (err) {
        console.log(post.url);
      }
    });
  }
}

const app = async () => {
  for (let i = 0; i < 60000; i++) {
    const limit = 10;
    const start = (i * limit) + 1;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    });

    const data = await posts(start, limit);

    for (const post of data) {
      await store(browser, post);
    }

    await browser.close();
  }

  return true
}

app()
  .then(() => console.log('done'))
  .catch(e => console.error(e));
