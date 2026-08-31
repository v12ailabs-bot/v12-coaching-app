// BMI is an estimate — it ignores body composition entirely — but clients
// like seeing the number, so it's surfaced wherever weight already is.
export function computeBMI(heightIn, weightLb) {
  if (!heightIn || !weightLb) return null;
  const bmi = (weightLb / (heightIn * heightIn)) * 703;
  return Math.round(bmi * 10) / 10;
}

export function bmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}
