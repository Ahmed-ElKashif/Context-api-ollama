/**
 * Ambient module declaration for hpp@0.2.3
 *
 * hpp has no bundled types and @types/hpp does not exist on npm.
 * This file is picked up automatically because tsconfig.json includes "src/**\/*".
 * The `declare module` wrapper makes it an ambient declaration (not a local module),
 * so TypeScript resolves `import hpp from 'hpp'` project-wide.
 */
declare module 'hpp' {
  import { RequestHandler } from 'express'

  function hpp(options?: {
    /** Query params that are allowed to have multiple values (won't be collapsed). */
    whitelist?: string | string[]
    checkQuery?: boolean
    checkBody?: boolean
  }): RequestHandler

  export = hpp
}
