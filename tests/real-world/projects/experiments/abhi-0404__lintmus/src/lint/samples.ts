/** The 60-second puzzle: three planted silent bugs (r01, r02, r03). */
export const PUZZLE_METRIC_NAMES = ['checkout_completed']

export const PUZZLE_CODE = `import flagsmith from '@flagsmith/flagsmith'

await flagsmith.init({
  environmentID: 'YOUR_CLIENT_SIDE_KEY',
  identity: user.id,
})

const buttonStyle = flagsmith.getValue('checkout_button')
renderCheckout(buttonStyle)

function onPurchase() {
  flagsmith.trackEvent('Checkout_Completed')
}
`

/** The same snippet with all three bugs fixed. */
export const PUZZLE_SOLUTION = `import flagsmith from '@flagsmith/flagsmith'

await flagsmith.init({
  environmentID: 'YOUR_CLIENT_SIDE_KEY',
  identity: user.id,
  enableEvents: true,
})

const flag = flagsmith.getExperimentFlag('checkout_button')
renderCheckout(flag?.value)

function onPurchase() {
  flagsmith.trackEvent('checkout_completed')
}
`
