import nock from 'nock';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import debug from 'debug';
import pageLoader from '../src';

const logTest = debug('tests:');

nock.disableNetConnect();

describe('tested pageLoader app', () => {
  const testedUrl = 'https://hexlet.ru/courses';
  const pathToTestFile = (name) => path.join(__dirname, '..', '__fixtures__', ...name);

  const lodedTags = [
    ['img', 'src-A_houtte.jpg'],
    ['link', 'src-style.css'],
    ['script', 'src-js-index.js'],
  ];

  let testDirResult;
  let contentLinks;
  let expectedDir;
  beforeAll(async () => {
    contentLinks = {
      mainFile: await fs.readFile(pathToTestFile(['test.html']), 'utf-8'),
      mainFileChanged: await fs.readFile(pathToTestFile(['test-ru.html']), 'utf-8'),
      link: await fs.readFile(pathToTestFile(['src', 'style.css']), 'utf-8'),
      img: await fs.readFile(pathToTestFile(['src', 'A_houtte.jpg']), 'utf-8'),
      script: await fs.readFile(pathToTestFile(['src', 'js', 'index.js']), 'utf-8'),
    };

    nock('https://hexlet.ru')
      .persist()
      .get(/\/courses/)
      .reply(200, contentLinks.mainFile)
      .get(/src\/style.css/)
      .reply(200, contentLinks.link)
      .get(/index.js/)
      .reply(200, contentLinks.script)
      .get(/A_houtte.jpg/)
      .reply(200, contentLinks.img)
      .get(/\/no_page/)
      .replyWithError({
        code: 'ERROR',
      });
  });

  beforeEach(async () => {
    testDirResult = await fs.mkdtemp(path.join(os.tmpdir(), 'loader-'));
    logTest(`Create temp directory  ${testDirResult}`);
  });

  test('DOWNnload main file', async () => {
    const expectedMainFile = path.join(testDirResult, 'hexlet-ru-courses.html');
    await pageLoader(testedUrl, testDirResult);
    const actual = await fs.readFile(expectedMainFile, 'utf-8');
    expect(actual).toEqual(contentLinks.mainFileChanged);
  });

  test.each(lodedTags)('Load %s file', async (ext, fileName) => {
    expectedDir = path.join(testDirResult, 'hexlet-ru-courses_files');
    await fs.mkdir(expectedDir);
    await pageLoader(testedUrl, testDirResult);
    const expectedFile = path.join(expectedDir, fileName);
    const actual = await fs.readFile(expectedFile, 'utf-8');
    expect(actual).toEqual(contentLinks[ext]);
  });

  test('Wrong load link', async () => {
    await expect(pageLoader('/undef')).rejects.toThrow();
  });

  test('No response from URL', async () => {
    const { href } = new URL('no_page', testedUrl);
    await expect(pageLoader(href)).rejects.toMatchObject({
      code: 'ERROR',
    });
  });

  afterEach(async () => {
    await fs.rmdir(testDirResult, { recursive: true });
    logTest(`Remove temp directory  ${testDirResult}`);
  });
});
