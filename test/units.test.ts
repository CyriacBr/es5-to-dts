import * as fs from 'fs';
import * as path from 'path';
import { Runner, Options } from '../src/generator/runner';
import * as util from 'util';
import * as ts from 'typescript';
import { DTSWriter } from '../src/generator/dtsWriter';

const cases: [string, string, string][] = [];

const files = fs.readdirSync(path.resolve(__dirname, './units'));

for (const file of files) {
  if (file.match(/(.+)\.js$/)) {
    const name = RegExp.$1;
    const code = fs.readFileSync(path.resolve(__dirname, './units', file)).toString();

    let optionsRaw;
    try {
      optionsRaw = fs
        .readFileSync(path.resolve(__dirname, './units', name + '.options.json'))
        .toString();
    } catch (error) {
      optionsRaw = JSON.stringify({ namespace: 'Test' });
    }
    let { mockupMode } = optionsRaw;

    let expectedDts;
    try {
      expectedDts = fs.readFileSync(path.resolve(__dirname, './units', name + '.d.ts')).toString();
    } catch (error) {
      expectedDts = `'${name}.d.ts not found';`;
    }
    
    let expectedMockup;
    if(mockupMode) {
      try {
        expectedMockup = fs.readFileSync(path.resolve(__dirname, './units', name + '.mockup.ts')).toString();
      } catch (error) {
        expectedMockup = `'${name}.mockup.ts not found';`;
      }
    }

    const dts = Runner.run(
      JSON.parse(optionsRaw),
      [
        {
          content: code,
          fileName: 'file.ts'
        }
      ],
      name,
      __dirname,
      'output'
    );

    const log = util.inspect(Runner.result); //JSON.stringify(Runner.result);
    fs.writeFileSync(path.resolve(__dirname, './units', name + '.logs.json'), log);
    cases.push([name, dts, expectedDts]);
    if(mockupMode) {
      cases.push([name + ' mockup', dts, expectedMockup]);
    }
  }
}

const options = {
  preserve_newlines: false
};
test.each(cases)('%s', (name, value, expected) => {
  expect(value).toBe(DTSWriter.print(expected));
  //expect(Beautify.js(value, options)).toBe(Beautify.js(expected, options));
});
