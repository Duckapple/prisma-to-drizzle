import Bun from "bun";
import { prismaToAST } from "./prisma-to-ast";
import { ASTToDrizzle } from "./ast-to-drizzle";

const prismaSchemaPath = Bun.argv[2];

const prismaText = await Bun.file(prismaSchemaPath).text();

const ast = prismaToAST(prismaText);

console.log(ast.generators);
console.log(ast.datasources);

const drizzle = ASTToDrizzle(ast);

Bun.write("./out.ts", drizzle);
