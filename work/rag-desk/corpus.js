// Fictional sample documents for the demo (not real policies of any organisation).
window.CORPUS = [
  {
    id: "grade", title: "Packing house grading standard", tag: "Standard",
    chunks: [
      "Apples are graded by weight, sugar content and color coverage. Grade AA apples must weigh at least 300 g each, reach 14 Brix or more, and show at least 70% color coverage. Grade A requires 250 g or more, 12 Brix or more, and at least 50% color coverage.",
      "Pears are graded by weight and skin condition. Grade AA pears weigh at least 600 g each and have no cuts or bruises on the skin. A pear with at most one minor blemish is classed as grade A.",
      "The non-destructive sugar meter is calibrated with a reference sample every day before work starts. If the calibration error exceeds 0.5 Brix, grading on that line stops and the equipment lead is notified.",
      "A grower who disputes a grading result can request regrading within 3 days of shipment. Regrading is done on a different line, and its result is recorded as final.",
    ],
  },
  {
    id: "settle", title: "Shipment settlement procedure", tag: "Procedure",
    chunks: [
      "Settlement for a shipment is paid to the grower's account within 2 business days of the winning bid at auction. The settled amount is the winning bid minus the consignment fee, freight and the grading fee.",
      "The consignment fee is 7% of the winning bid, and the grading fee is KRW 300 per box. Freight depends on distance and volume and is itemised on the settlement statement.",
      "Settlement statements are sent at 9 a.m. on the payment day, by text message and on the grower portal at the same time. Errors in a statement are disputed through the portal's dispute menu within 7 days.",
    ],
  },
  {
    id: "cold", title: "Cold storage operating manual", tag: "Manual",
    chunks: [
      "Apple cold storage is held at 0 to 1 ℃ with 90 to 95% relative humidity. Pear storage works best at 1 to 2 ℃ with 85 to 90% relative humidity.",
      "An alarm fires when storage temperature stays more than 2 ℃ off its setpoint for over 30 minutes. When the alarm sounds, the operator must check the room within 15 minutes and inspect the chiller and the door seals.",
      "During a power outage, the rule is to keep the storage doors closed. With the doors shut the room holds its temperature for about 6 hours; if the outage lasts 4 hours or more, start the emergency generator.",
    ],
  },
  {
    id: "machine", title: "Sorting machine inspection checklist", tag: "Checklist",
    chunks: [
      "Check conveyor belt tension and wear visually every day before work. Clean the camera lenses twice a day, before work starts and after lunch.",
      "Calibrate the optical sorting camera once a week against the reference color chart. Record the result in the maintenance system; if the color difference exceeds tolerance, replace the lens and the lighting.",
      "Lubricate bearings once a month and inspect the motor and gearbox in detail once a quarter. Keep the equipment inspection history for 3 years.",
    ],
  },
  {
    id: "privacy", title: "Personal data handling policy", tag: "Policy",
    chunks: [
      "A grower member's personal data is destroyed without delay after the member leaves. Settlement and tax records, however, are kept for 5 years as required by law.",
      "Access to personal data is granted only to the minimum number of staff who need it for their work. Access logs of the personal data system are kept for 2 years and reviewed once a month.",
    ],
  },
  {
    id: "incident", title: "System outage response procedure", tag: "Procedure",
    chunks: [
      "When the auction system fails, the operations team posts an outage notice within 5 minutes and assigns a severity level. A severity 1 outage means the auction cannot run.",
      "If a severity 1 outage lasts 30 minutes or more, the auction switches to manual bidding. Manual auction results are entered into the system within 24 hours of recovery.",
      "Within 3 business days of the outage ending, a root cause report is written and the prevention measures are shared.",
    ],
  },
];
