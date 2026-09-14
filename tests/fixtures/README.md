# CMM test fixtures

Binary STL meshes produced by the real engine (openscad-wasm 0.0.4 through the app's own
pipeline), gzipped. `fixture-cases.json` is the OpenSCAD that made each one and
`fixture-results.json` what the app measured when it did. Regenerate with the harness:

    node tests/harness/run.mjs tests/fixtures/fixture-cases.json out.json --settings '{"bed":[1000,1000,1000]}' --dump-stl tests/fixtures
    gzip -9 tests/fixtures/*.stl
