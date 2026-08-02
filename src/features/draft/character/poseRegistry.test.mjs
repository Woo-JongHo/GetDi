import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_POSE_IDS, CHARACTER_POSES, validateCharacterPoseRegistry } from "./poseRegistry.js";

test("캐릭터 pose 8개가 고유 component와 접근성 label을 가진다", () => {
  assert.equal(CHARACTER_POSE_IDS.length, 8);
  assert.deepEqual(validateCharacterPoseRegistry(), []);
  assert.equal(new Set(Object.values(CHARACTER_POSES).map((pose) => pose.component)).size, 8);
});

test("누락·중복·미등록 pose를 거부한다", () => {
  const invalid = {
    ...CHARACTER_POSES,
    thinking: { component: "PointingPose", label: "" },
    extra: { component: "ExtraPose", label: "추가" },
  };
  const errors = validateCharacterPoseRegistry(invalid);
  assert.ok(errors.some((error) => error.includes("accessibility")));
  assert.ok(errors.some((error) => error.includes("duplicate component")));
  assert.ok(errors.some((error) => error.includes("unregistered pose")));
});
