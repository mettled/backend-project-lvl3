import { promises as fs, createWriteStream } from 'fs';
import axios from 'axios';
import path from 'path';
import cherio from 'cheerio';
import 'axios-debug-log';
import debug from 'debug';
import Listr from 'listr';

const log = debug('page-loader:');

const tags = [
  ['link', 'href'],
  ['img', 'src'],
  ['script', 'src'],
];

const buildName = (pathname, replaceDot = false) => {
  const checkedPathName = pathname.slice(-1) === '/' ? pathname.slice(0, -1) : pathname;
  const replacer = replaceDot ? /[^\w.]/g : /[^\w]/g;
  return checkedPathName.replace(replacer, '-');
};

const createSettings = (baseLink, outDirectory) => {
  const baseUrl = new URL(baseLink);
  const { hostname, pathname } = baseUrl;
  const changedPath = buildName(`${hostname}${pathname}`);
  return {
    baseUrl,
    main: path.join(outDirectory, `${changedPath}.html`),
    src: path.normalize(`${changedPath}_files`),
  };
};

const isLocalDomain = (link, baseUrl) => {
  const { origin, hostname: baseHostname } = baseUrl;
  const { hostname } = new URL(link, origin);

  return link && path.parse(link).ext && baseHostname === hostname;
};

const processHtml = (htmlContent, { baseUrl, src }) => {
  const convertedLinks = new Map();
  const $ = cherio.load(htmlContent);
  tags.forEach(([tag, attr]) => {
    $(tag).each((i, elem) => {
      const link = $(elem).attr(attr);
      if (isLocalDomain(link, baseUrl)) {
        const { pathname } = new URL(link, baseUrl.origin);
        const changedName = buildName(pathname.slice(1), true);

        const newPath = path.join(src, changedName);
        convertedLinks.set(link, newPath);
        $(elem).attr(attr, newPath);
      }
    });
  });
  return {
    convertedLinks,
    processedHtml: $.html(),
  };
};

const loadContent = (loadLink, uploadLink) => ({
  title: `Upload ${loadLink} to ${uploadLink}`,
  task: () => axios({
    method: 'get',
    url: loadLink,
    responseType: 'stream',
  })
    .then((response) => {
      log(`Upload ${loadLink} 
      to ${uploadLink}`);
      response.data.pipe(createWriteStream(uploadLink));
    }),
});

export default (baseLink, outDirectory) => {
  const settings = createSettings(baseLink, outDirectory);
  let processedData = null;

  log(`load ${baseLink}`);
  return axios.get(baseLink)
    .then(({ data }) => {
      log(`Change link in ${settings.main}`);
      const { baseUrl, src } = settings;
      processedData = processHtml(data, { baseUrl, src });

      log(`Create directory ${outDirectory}`);
      return fs.mkdir(path.join(outDirectory, src), { recursive: true });
    })
    .then(() => {
      log(`Write changed file to ${outDirectory}`);
      return fs.writeFile(settings.main, processedData.processedHtml);
    })
    .then(() => (
      new Listr(
        Array.from(processedData.convertedLinks.entries())
          .map(([link, newPath]) => {
            const loadLink = new URL(link, settings.baseUrl.origin);
            const newFilePath = path.join(outDirectory, newPath);
            return loadContent(loadLink.href, newFilePath);
          }),
        { concurrent: true },
      ).run()
    ));
};
