import * as fs from 'fs';
import * as path from 'path';
import { Runner } from '../src/generator/runner';
import * as Beautify from 'js-beautify';

const cases: [string, string, string][] = [];

const files = fs.readdirSync(path.resolve(__dirname, './units'));

for (const file of files) {
  if (file.match(/(.+)\.js/)) {
    const name = RegExp.$1;
    const code = fs.readFileSync(path.resolve(__dirname, './units', file)).toString();
    let expectedDts;
    try {
      expectedDts = fs.readFileSync(path.resolve(__dirname, './units', name + '.d.ts')).toString();
    } catch (error) {
      expectedDts = name + '.d.ts not found';
    }
    const dts = Runner.run(
      'Test',
      {
        content: code,
        fileName: 'file.ts'
      },
      name,
      __dirname,
      'output'
    );
    cases.push([name, dts, expectedDts]);
  }
}

const options = {
  preserve_newlines: false
};
test.each(cases)('%s', (name, value, expected) => {
  expect(Beautify.js(value, options)).toBe(Beautify.js(expected, options));
});
