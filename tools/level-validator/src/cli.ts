import { factoryRoom } from '@under-control/shared';
import { validateRoom } from './validateRoom';

const result = validateRoom(factoryRoom);
for (const issue of result.issues) {
  console.log(`${issue.level.toUpperCase()} [${issue.code}] ${issue.message}`);
}

if (!result.valid) {
  console.error(`Room ${result.roomId} failed validation.`);
  process.exitCode = 1;
} else {
  console.log(`Room ${result.roomId} passed validation.`);
}
