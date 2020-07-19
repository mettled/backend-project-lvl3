import { promises as fs, createWriteStream } from 'fs';
import axios from 'axios';
import path from 'path';
import cherio from 'cheerio';
import 'axios-debug-log';
import debug from 'debug';
import Listr from 'listr';

const logging = debug('page-loader:');

const tags = [
  ['link', 'href'],
  ['img', 'src'],
  ['script', 'src'],
];

const convertedLinks = new Map();

const settings = {
  baseUrl: null,
  main: null,
  src: null,
};

const buildName = (pathname, replaceDot = false) => {
  const replacer = replaceDot ? /[^\w.]/g : /[^\w]/g;
  return pathname.replace(replacer, '-');
};

const createSettings = (baseUrl, outDirectory) => {
  settings.baseUrl = new URL(baseUrl);
  const { hostname, pathname } = settings.baseUrl;
  const changedPath = buildName(`${hostname}${pathname}`);

  settings.main = path.join(outDirectory, `${changedPath}.html`);
  settings.src = path.normalize(`${changedPath}_files`);
};

const isLocalDomain = (link) => {
  const { origin, hostname: baseHostname } = settings.baseUrl;
  const { hostname } = new URL(link, origin);

  return link && path.parse(link).ext && baseHostname === hostname;
};

const processHtml = (htmlContent) => {
  const $ = cherio.load(htmlContent);
  tags.forEach(([tag, attr]) => {
    $(tag).each((i, elem) => {
      const link = $(elem).attr(attr);
      if (isLocalDomain(link)) {
        const { pathname } = new URL(link, settings.baseUrl.origin);
        const changedName = buildName(pathname.slice(1), true);

        const newLink = path.join(settings.src, changedName);
        convertedLinks.set(link, newLink);
        $(elem).attr(attr, newLink);
      }
    });
  });
  return $.html();
};

const loadContent = (loadLink, uploadLink) => ({
  title: `Upload ${loadLink} to ${uploadLink}`,
  task: () => axios({
    method: 'get',
    url: loadLink,
    responseType: 'stream',
  })
    .then((response) => {
      logging(`Upload ${loadLink} 
      to ${uploadLink}`);
      response.data.pipe(createWriteStream(uploadLink));
    }),
});

export default (baseLink, outDirectory = process.cwd()) => (
  new Promise((resolve) => resolve(createSettings(baseLink, outDirectory)))
    .then(() => {
      logging(`Create directory ${outDirectory}`);
      fs.mkdir(path.join(outDirectory, settings.src), { recursive: true });
    })
    .then(() => {
      logging(`load ${baseLink}`);
      return axios.get(baseLink);
    })
    .then(({ data }) => {
      logging(`Change link in ${settings.main}`);
      const changedHtml = processHtml(data);
      fs.writeFile(settings.main, changedHtml);
    })
    .then(() => (
      new Listr(
        Array.from(convertedLinks.entries())
          .map(([link, fileLink]) => {
            const loadLink = new URL(link, settings.baseUrl.origin);
            const newFileLink = path.join(outDirectory, fileLink);
            return loadContent(loadLink.href, newFileLink);
          }),
        { concurrent: true },
      ).run()
    ))
);
