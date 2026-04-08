/**
 * Mock OCR service — returns hardcoded sample output.
 * Will be replaced with a real OCR API call later.
 */
export async function extractTextFromPdf(file) {
  await new Promise((r) => setTimeout(r, 600))

  return `
=== Page 1 ===

JSONata Expression – Premium Calculation Rule (v2.4)

(
  $base := payload.applicant.annualIncome * 0.03;

  $ageFactor := $lookup({
    "18-25": 1.4,
    "26-35": 1.0,
    "36-50": 1.15,
    "51-65": 1.35,
    "65+":   1.6
  }, payload.applicant.ageBand);

  $regionMultiplier := payload.region = "high_risk" ? 1.25 : 1.0;

  $discounts := $sum(payload.applicant.discounts.(
    type = "loyalty"     ? -0.05 * $base :
    type = "multi_policy" ? -0.08 * $base :
    type = "no_claims"   ? -0.10 * $base :
    0
  ));

  $rawPremium := $base * $ageFactor * $regionMultiplier + $discounts;

  $premium := $max([$rawPremium, 250]);

  {
    "premium":     $round($premium, 2),
    "breakdown": {
      "base":              $round($base, 2),
      "ageFactor":         $ageFactor,
      "regionMultiplier":  $regionMultiplier,
      "discounts":         $round($discounts, 2),
      "floor":             250
    },
    "applicant":   payload.applicant.id,
    "effectiveDate": $now()
  }
)

=== Page 2 ===

Notes:
- ageBand must be one of: "18-25", "26-35", "36-50", "51-65", "65+"
- If ageBand is missing or unrecognised the expression will return null for ageFactor
- Minimum premium floor is $250 regardless of discounts
- Discount types recognised: loyalty, multi_policy, no_claims
- Rule owner: Underwriting Team — last reviewed 2025-09-14
`.trim()
}
