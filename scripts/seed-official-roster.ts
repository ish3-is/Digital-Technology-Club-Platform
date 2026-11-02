import { seedOfficialRoster } from "../src/lib/account-requests/official-roster";

const result = await seedOfficialRoster();
console.log(
  `تم تجهيز ${result.committees} لجان و${result.members} سجل عضوية رسمي دون إنشاء حسابات وهمية.`,
);
process.exit(0);
