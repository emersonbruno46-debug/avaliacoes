export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/headers') {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export async function cookies(){ return { get: () => null, set: () => {}, delete: () => {} }; }',
    };
  }
  if (specifier === 'next/server') {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export class NextResponse { static json(data, init) { return { data, status: init?.status || 200, headers: new Map(Object.entries(init?.headers || {})) }; } }',
    };
  }
  if (specifier === 'server-only') {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export default {};',
    };
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('@/')) &&
    !specifier.endsWith('.ts') &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.mjs')
  ) {
    let fixed = specifier;
    if (fixed.startsWith('@/')) {
      fixed = './' + fixed.slice(2);
    }
    try {
      return await nextResolve(fixed + '.ts', context);
    } catch {}
  }

  return nextResolve(specifier, context);
}
