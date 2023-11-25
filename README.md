# prisma-to-drizzle

Convert a prisma schema to a drizzle model.
Creates enums and tables for each enum and model in the prisma schema, and creates a database client ready for use.

Requires Bun, as I used its IO APIs for loading and writing files, even though I didn't really need to.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun index.ts <schema.prisma>
```
