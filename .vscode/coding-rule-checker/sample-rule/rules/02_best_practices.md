## 2. Best Practices

### 2.1 Use Const and Let

Prefer const and let over var.

- Use const for values that won't be reassigned
- Use let for values that will be reassigned
- Never use var

**Good Example:**

```javascript
const MAX_USERS = 100;
let currentUsers = 0;
```

**Bad Example:**

```javascript
var MAX_USERS = 100;
var currentUsers = 0;
```

### 2.2 Avoid Magic Numbers

Don't use unexplained numeric literals in code.

- Define constants with meaningful names
- Use enums or const objects for related values
- Document the meaning of numbers

**Good Example:**

```javascript
const MAX_RETRY_ATTEMPTS = 3;
const TIMEOUT_MS = 5000;

if (retryCount > MAX_RETRY_ATTEMPTS) {
  throw new Error('Max retries exceeded');
}
```

**Bad Example:**

```javascript
if (retryCount > 3) {
  throw new Error('Max retries exceeded');
}
```

### 2.3 Comments and Documentation

Code should be self-documenting, but complex logic requires comments.

- Write clear, concise comments for complex logic
- Use JSDoc for function documentation
- Keep comments up-to-date with code changes
- Don't comment obvious code

**Good Example:**

```javascript
/**
 * Calculates the final price including tax and discount
 * @param {number} basePrice - The base price before tax/discount
 * @param {number} taxRate - Tax rate as a decimal (e.g., 0.1 for 10%)
 * @param {number} discountRate - Discount rate as a decimal
 * @returns {number} The final price
 */
function calculateFinalPrice(basePrice, taxRate, discountRate) {
  const priceAfterDiscount = basePrice * (1 - discountRate);
  return priceAfterDiscount * (1 + taxRate);
}
```
