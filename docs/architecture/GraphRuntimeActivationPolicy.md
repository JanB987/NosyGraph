# Store-mode activation policy

`evaluateGraphRuntimeActivation()` is the final default-selection guard for store mode. It requires evidence for all seven gates:

- automated regression;
- controlled legacy/replacement physics parity;
- manual B01–B14 badge regression;
- interactive Obsidian physics verification;
- persistence parity;
- lifecycle parity;
- exclusive ownership cutover.

When every flag is true, `GraphRuntimeModeSelector` defaults to `store` and allows store creation without the temporary trial flag. When any flag is missing, the selector defaults to `legacy`; store mode remains available only through an explicit guarded trial.

The current evidence constant deliberately leaves controlled physics parity, manual badge regression, interactive verification, and ownership cutover false. D5 therefore installs the activation mechanism without claiming that the live plugin is ready for a default switch. Updating the evidence record is the explicit activation step after those gates have convincing results.