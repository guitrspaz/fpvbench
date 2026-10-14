/** Fixed paraphrases checked against primary Betaflight documentation; never fetched during analysis. */
export const BETAFLIGHT_DOCUMENTATION = Object.freeze([
  {
    title: 'Betaflight PID Tuning Tab', url: 'https://betaflight.com/docs/wiki/app/pid-tuning-tab', checkedAt: '2026-10-14',
    guidance: 'PID/filter profiles and rate profiles are separate. Rates and expo shape stick response; they do not alone establish aircraft stability. PID gain changes involve response, oscillation and motor-heat tradeoffs. Less filtering admits more noise and can cause serious motor heating or flyaways. RPM filtering depends on bidirectional DShot support and correct motor-pole configuration. The documentation includes firmware-specific behavior; applicability to this export is unverified.',
  },
  {
    title: 'Betaflight Presets Tab', url: 'https://betaflight.com/docs/wiki/app/presets-tab', checkedAt: '2026-10-14',
    guidance: 'Betaflight offers preset filtering by firmware and category. Review a preset’s description, options, warnings and command preview in Betaflight before choosing it. This assistant does not establish a compatible preset or generate commands.',
  },
]);
