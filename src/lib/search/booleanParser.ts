// src/lib/search/booleanParser.ts

export type ASTNode =
  | { type: "AND"; left: ASTNode; right: ASTNode }
  | { type: "OR"; left: ASTNode; right: ASTNode }
  | { type: "NOT"; operand: ASTNode }
  | { type: "TERM"; value: string };

function tokenize(input: string): string[] {
  const regex = /\(|\)|"([^"]+)"|([^\s()]+)/g;
  const tokens: string[] = [];
  let match;
  while ((match = regex.exec(input)) !== null) {
    if (match[1]) {
      tokens.push(`"${match[1]}"`);
    } else {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

export function parseBooleanQuery(queryStr: string): ASTNode | null {
  const tokens = tokenize(queryStr);
  let position = 0;

  function parseExpression(): ASTNode {
    let node = parseTermExpression();
    while (position < tokens.length) {
      const token = tokens[position].toUpperCase();
      if (token === "OR") {
        position++;
        const right = parseTermExpression();
        node = { type: "OR", left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  function parseTermExpression(): ASTNode {
    let node = parseFactorExpression();
    while (position < tokens.length) {
      const token = tokens[position].toUpperCase();
      if (token === "AND") {
        position++;
        const right = parseFactorExpression();
        node = { type: "AND", left: node, right };
      } else if (token !== "OR" && token !== ")") {
        // Implicit AND
        const right = parseFactorExpression();
        node = { type: "AND", left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  function parseFactorExpression(): ASTNode {
    if (position >= tokens.length) {
      return { type: "TERM", value: "" };
    }
    const token = tokens[position];
    if (token.toUpperCase() === "NOT") {
      position++;
      const operand = parseFactorExpression();
      return { type: "NOT", operand };
    }
    if (token === "(") {
      position++;
      const node = parseExpression();
      if (position < tokens.length && tokens[position] === ")") {
        position++;
      }
      return node;
    }
    position++;
    const cleanValue = token.startsWith('"') && token.endsWith('"')
      ? token.slice(1, -1)
      : token;
    return { type: "TERM", value: cleanValue };
  }

  if (tokens.length === 0) return null;
  try {
    return parseExpression();
  } catch {
    return null;
  }
}

/**
 * Compiles the AST into an SQL snippet with parameterized placeholders.
 * Returns an object with the sql template (using parameterized placeholders)
 * and the array of parameters to bind.
 */
export function compileASTToSQL(
  node: ASTNode | null,
  startIndex: number = 1
): { sql: string; params: any[] } {
  if (!node) {
    return { sql: "1=1", params: [] };
  }

  const params: any[] = [];
  let paramIndex = startIndex;

  function compile(n: ASTNode): string {
    if (n.type === "AND") {
      return `(${compile(n.left)} AND ${compile(n.right)})`;
    }
    if (n.type === "OR") {
      return `(${compile(n.left)} OR ${compile(n.right)})`;
    }
    if (n.type === "NOT") {
      return `(NOT ${compile(n.operand)})`;
    }

    const term = n.value;
    if (!term) return "1=1";

    const p1 = `$${paramIndex++}`;
    params.push(`%${term}%`);

    const p2 = `$${paramIndex++}`;
    params.push(term);

    // Matches against candidate skills, role, name, tags, and job location (if joined)
    return `(
      candidates.skills::text ILIKE ${p1} OR 
      candidates.role ILIKE ${p1} OR 
      candidates.name ILIKE ${p1} OR
      EXISTS (
        SELECT 1 FROM candidate_tags ct 
        WHERE ct.candidate_id = candidates.id AND ct.tag_name ILIKE ${p2}
      ) OR
      EXISTS (
        SELECT 1 FROM jobs j 
        WHERE j.id = candidates.job_id AND j.location ILIKE ${p1}
      )
    )`;
  }

  const sql = compile(node);
  return { sql, params };
}
