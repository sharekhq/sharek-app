import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Upstream's Facebook, Instagram, LinkedIn Page, Threads and X analytics hand
 * back `percentageChange: 5` whatever the data says, so the page showed
 * "▲ 5.0%" on cards nobody measured a change for. Sharek returns `0` there, the
 * value every other provider already returns, and a `0` shows no change figure.
 *
 * A failure here means a provider is returning a made-up change again — most
 * likely a weekly merge that brought one of upstream's 5s back. Set it to 0.
 * A value computed from the channel's own data passes: that is a real change.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

const providers = fs
  .readdirSync(__dirname)
  .filter((name) => name.endsWith('.provider.ts'))
  .map((name) => path.join(__dirname, name));

interface Assignment {
  at: string;
  value: ts.Expression;
}

// Read as TypeScript rather than as text, so a comment quoting an old value or
// an interface declaring `percentageChange: number` is never mistaken for one.
const assignmentsIn = (file: string): Assignment[] => {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  );
  const found: Assignment[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'percentageChange'
    ) {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      found.push({
        at: `${path.relative(ROOT, file).split(path.sep).join('/')}:${line}`,
        value: node.initializer,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

// `5`, `5.0` and `-5` are made up; `0` and anything computed are not.
const isMadeUp = (value: ts.Expression) => {
  const literal = ts.isPrefixUnaryExpression(value) ? value.operand : value;
  return ts.isNumericLiteral(literal) && Number(literal.text) !== 0;
};

const assignments = providers.map(assignmentsIn);

describe('analytics change values', () => {
  it('has no provider returning a non-zero literal percentageChange', () => {
    expect(
      assignments
        .flat()
        .filter((assignment) => isMadeUp(assignment.value))
        .map((assignment) => assignment.at)
    ).toEqual([]);
  });

  // Without this the guard could pass by reading nothing at all: a renamed
  // file pattern, a moved folder and a clean tree look identical from above.
  it('reads every provider that reports a change value', () => {
    expect(
      assignments.filter((found) => found.length > 0).length
    ).toBeGreaterThanOrEqual(10);
  });
});
