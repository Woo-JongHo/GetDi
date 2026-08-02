const CHARACTER_POSE_IDS = Object.freeze([
  "thinking",
  "pointing",
  "comparing",
  "checking",
  "warning",
  "celebrating",
  "confused",
  "reading",
]);

const CHARACTER_POSES = Object.freeze({
  thinking: { component: "ThinkingPose", label: "턱을 괴고 생각하는 GetDi 캐릭터" },
  pointing: { component: "PointingPose", label: "옆을 가리키는 GetDi 캐릭터" },
  comparing: { component: "ComparingPose", label: "두 선택지를 비교하는 GetDi 캐릭터" },
  checking: { component: "CheckingPose", label: "확인 표시를 드는 GetDi 캐릭터" },
  warning: { component: "WarningPose", label: "주의 표지를 드는 GetDi 캐릭터" },
  celebrating: { component: "CelebratingPose", label: "두 팔을 들고 기뻐하는 GetDi 캐릭터" },
  confused: { component: "ConfusedPose", label: "물음표와 함께 헷갈려 하는 GetDi 캐릭터" },
  reading: { component: "ReadingPose", label: "자료를 읽는 GetDi 캐릭터" },
});

const VISUALIZATION_POSE = Object.freeze({
  statement: "pointing",
  comparison: "comparing",
  steps: "checking",
  cycle: "thinking",
  checklist: "checking",
  warning: "warning",
  example: "reading",
  quote: "reading",
  number: "celebrating",
});

function poseForVisualization(method) {
  return VISUALIZATION_POSE[method] || "thinking";
}

function validateCharacterPoseRegistry(registry = CHARACTER_POSES, ids = CHARACTER_POSE_IDS) {
  const errors = [];
  const idSet = new Set(ids);
  const components = new Set();

  if (idSet.size !== ids.length) errors.push("pose IDs must be unique");
  for (const id of ids) {
    const pose = registry[id];
    if (!pose) {
      errors.push(`missing pose: ${id}`);
      continue;
    }
    if (!pose.label?.trim()) errors.push(`missing accessibility label: ${id}`);
    if (!pose.component?.trim()) errors.push(`missing component: ${id}`);
    if (components.has(pose.component)) errors.push(`duplicate component: ${pose.component}`);
    components.add(pose.component);
  }
  for (const id of Object.keys(registry)) {
    if (!idSet.has(id)) errors.push(`unregistered pose: ${id}`);
  }
  return errors;
}

export {
  CHARACTER_POSE_IDS,
  CHARACTER_POSES,
  VISUALIZATION_POSE,
  poseForVisualization,
  validateCharacterPoseRegistry,
};
