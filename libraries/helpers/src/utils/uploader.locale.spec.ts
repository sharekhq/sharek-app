// Feature 029-arabic-audit-followup, added after the rollout walk found the defect it
// guards (C7).
//
// Uppy's Dashboard draws its own drop zone and status bar from its own English and
// prints its own badge. Neither is a literal in this repository, so C3 cannot see them
// and C6 does not walk components — a Dashboard that is simply not given `locale`
// shows English inside an otherwise Arabic panel with every check green.
//
// That is not hypothetical. Research R5 concluded the media library held the only live
// uploader; it checked `new.uploader.tsx`, which renders nothing, and missed
// `new-launch/editor.tsx`, which renders the compose modal's drop zone with byte-
// identical configuration. The media library shipped translated and the compose modal
// shipped reading "Drop files here or browse files / Powered by Uppy" on an Arabic
// screen, and the walk is the only thing that found it.
//
// So the guard is on the shape rather than on the two files that have it today: every
// Dashboard the tree renders must be handed both props. A third one cannot arrive
// quietly.
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const REPO_ROOT = path.join(__dirname, '../../../..');
const ROOT = 'apps/frontend/src';

const REQUIRED = ['locale', 'proudlyDisplayPoweredByUppy'] as const;

const walkDir = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walkDir(full);
        return entry.isFile() && full.endsWith('.tsx') ? [full] : [];
      })
    : [];

interface Render {
  file: string;
  line: number;
  attributes: string[];
}

// Spread attributes are counted as unknown rather than as absent: `{...props}` may
// carry either prop, and reporting it would be a false positive nobody can act on.
const rendersIn = (file: string, source: ts.SourceFile): Render[] => {
  const found: Render[] = [];
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxOpeningElement(node)
      ? node
      : undefined;
    if (opening && opening.tagName.getText() === 'Dashboard') {
      const attributes = opening.attributes.properties.flatMap((property) =>
        ts.isJsxAttribute(property)
          ? [property.name.getText()]
          : ts.isJsxSpreadAttribute(property)
          ? ['...spread']
          : []
      );
      found.push({
        file: path.relative(REPO_ROOT, file),
        line:
          source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1,
        attributes,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const dashboards = (): Render[] =>
  walkDir(path.join(REPO_ROOT, ROOT)).flatMap((file) =>
    rendersIn(
      file,
      ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TSX
      )
    )
  );

describe('every Uppy Dashboard is given its words', () => {
  const rendered = dashboards();

  it.each(REQUIRED)('is handed %s wherever it renders', (attribute) => {
    const missing = rendered
      .filter(
        (render) =>
          !render.attributes.includes(attribute) &&
          !render.attributes.includes('...spread')
      )
      .map((render) => `${render.file}:${render.line}`);
    expect(missing).toEqual([]);
  });

  // Guards the guard. A walk that stopped finding Dashboards would report nothing
  // missing and pass — which is how this defect survived in the first place, one layer
  // up: research looked in one file and concluded there was one uploader.
  it('finds every Dashboard the tree renders', () => {
    expect(rendered.map((render) => render.file).sort()).toEqual([
      'apps/frontend/src/components/media/media.component.tsx',
      'apps/frontend/src/components/new-launch/editor.tsx',
    ]);
  });

  // And that the walk can fail: a Dashboard with neither prop must be reported.
  it('would report a Dashboard that was given neither', () => {
    const fixture = ts.createSourceFile(
      'fixture.tsx',
      'export const C = () => <Dashboard height={46} uppy={uppy} />;',
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const [render] = rendersIn('fixture.tsx', fixture);

    expect(render).toBeDefined();
    expect(REQUIRED.filter((a) => !render.attributes.includes(a))).toEqual([
      ...REQUIRED,
    ]);
  });
});
