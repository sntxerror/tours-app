/**
 * Jest-only stand-in for `@nestjs/typeorm`. The real package is ESM and uses `import.meta`, which
 * cannot be loaded in Jest's CommonJS mode. Unit tests build services by hand with fake repositories,
 * so only the decorators need to exist; the real wiring is exercised by the Playwright e2e suite.
 */
export const InjectRepository = (): ParameterDecorator => () => undefined;
export const InjectDataSource = (): ParameterDecorator => () => undefined;
export const TypeOrmModule = {};
