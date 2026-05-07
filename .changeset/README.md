# Changesets

This folder controls how this repo's packages are versioned and published.

## Add a changeset

```bash
pnpm changeset
```

Pick the affected packages, pick the bump (patch/minor/major), and write a one-line summary. Commit the resulting `.md` file.

## Publish

When you're ready to release:

```bash
pnpm changeset version   # consume changesets, bump versions, update lockfile
pnpm -r build            # build everything
pnpm changeset publish   # publish to npm (uses publishConfig.access from each package.json)
```

The `fixed` config in `config.json` keeps all `@stellar-agent-kit/*` + `stellar-agent-kit` + `create-stellar-agent` at the same version. Tier-1 publish for v0.3.x; tag with `--tag alpha` until we lift the alpha label.

Examples that aren't published live (they ship as part of the kit's `examples/` folder, not on npm) are listed in `ignore`.
