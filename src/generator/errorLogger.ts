import * as ts from 'typescript';
import * as util from 'util';
import chalk from 'chalk';

export interface ErrorLog {
  node: ts.Node;
  error: Error;
}

export class ErrorLogger {
  static logs: ErrorLog[] = [];
  static archive: ErrorLog[] = [];

  static add(node: ts.Node, error: Error) {
    this.logs.push({ node, error });
  }

  static store() {
    this.archive = [].concat(this.archive, this.logs);
    this.logs = [];
  }

  static display(program: ts.Program) {
    const srcFile = program.getSourceFiles()[0];
    return `${this.archive
      .map((l, i) => {
        let { line, character } = srcFile.getLineAndCharacterOfPosition(l.node.getStart());
        return `${chalk.bgRed(`Error ${i+1}:`)} ${l.error.message}
Sourcefile ${chalk.yellow(`line ${line}`)}, ${chalk.yellow(`character ${character}`)}
${chalk.bold('Stacktrace:')} ${l.error.stack}
${chalk.bold('Node:')} ${util.inspect(l.node)}`;
      })
      .join('\n\n')}`;
  }
}
