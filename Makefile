install:
	npm install

build:
	npm run build

lint:
	npm eslint .

test:
	npm run test

test-nock-debug:
	DEBUG=nock.scope.*,page-loader: npm test

test-debug:
	DEBUG=tests:,page-loader: npm test

start-axios-debug:
	DEBUG=axios,page-loader: npx babel-node src/bin/page-loader.js http://ru.hexlet.io/courses

start-debug:
	DEBUG=page-loader: npx babel-node src/bin/page-loader.js http://ru.hexlet.io/courses
