// Turn off once the team's product allocation has been confirmed.
export const productAllocationIsProvisional = true
export const productAllocationCsvFilename = productAllocationIsProvisional
  ? 'product-allocations-VOID.csv'
  : 'product-allocations.csv'

export const productAllocationWatermark = productAllocationIsProvisional ? '' : undefined
