import { promises as fs, createWriteStream } from 'fs';
import axios from 'axios';
import path from 'path';
import cherio from 'cheerio';
import 'axios-debug-log';
import debug from 'debug';
import Listr from 'listr';

const log = debug('page-loader:');

const buildName = (pathname, replaceDot = false) => {
  const checkedPathName = pathname.slice(-1) === '/' ? pathname.slice(0, -1) : pathname;
  const replacer = replaceDot ? /[^\w.]/g : /[^\w]/g;
  return checkedPathName.replace(replacer, '-');
};

const createSettings = (baseLink, outDirectory) => {
  try {
    const baseUrl = new URL(baseLink);
    const { hostname, pathname } = baseUrl;
    const changedPath = buildName(`${hostname}${pathname}`);
    return {
      baseUrl,
      main: path.join(outDirectory, `${changedPath}.html`),
      src: path.normalize(`${changedPath}_files`),
    };
  } catch (e) {
    return e;
  }
};

const isLocalDomain = (link, baseUrl) => {
  const { origin, hostname: baseHostname } = baseUrl;
  const { hostname } = new URL(link, origin);

  return link && path.parse(link).ext && baseHostname === hostname;
};

const processHtml = (htmlContent, { baseUrl, src }) => {
  const convertedLinks = new Map();
  const $ = cherio.load(htmlContent);
  [
    ['link', 'href'],
    ['img', 'src'],
    ['script', 'src'],
  ].forEach(([tag, attr]) => {
    $(tag).each((i, elem) => {
      const link = $(elem).attr(attr);
      if (isLocalDomain(link, baseUrl)) {
        const { pathname } = new URL(link, baseUrl.origin);
        const changedName = buildName(pathname.slice(1), true);

        const newLink = path.join(src, changedName);
        convertedLinks.set(link, newLink);
        $(elem).attr(attr, newLink);
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

  log(`load ${baseLink}`);
  return axios.get(baseLink)
    .then(({ data }) => {
      log(`Change link in ${settings.main}`);
      const { baseUrl, src } = settings;
      const {
        convertedLinks,
        processedHtml,
      } = processHtml(data, { baseUrl, src });

      settings.convertedLinks = convertedLinks;
      settings.processedHtml = processedHtml;
      log(`Create directory ${outDirectory}`);
      return fs.mkdir(path.join(outDirectory, src), { recursive: true });
    })
    .then(() => {
      log(`Write changed file to ${outDirectory}`);
      return fs.writeFile(settings.main, settings.processedHtml);
    })
    .then(() => (
      new Listr(
        Array.from(settings.convertedLinks.entries())
          .map(([link, fileLink]) => {
            const loadLink = new URL(link, settings.baseUrl.origin);
            const newFileLink = path.join(outDirectory, fileLink);
            return loadContent(loadLink.href, newFileLink);
          }),
        { concurrent: true },
      ).run()
    ));
};
