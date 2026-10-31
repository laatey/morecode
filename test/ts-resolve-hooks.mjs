/** Lets a test import app code that leaves the .ts off its relative imports (the app's bundler allows it, plain Node does not). */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND' &&
      /^\.{1,2}\//.test(specifier) &&
      !/\.\w+$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw err
  }
}
