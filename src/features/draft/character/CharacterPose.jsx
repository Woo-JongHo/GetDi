import React, { useId } from "react";
import { CHARACTER_POSES } from "./poseRegistry.js";

const INK = "currentColor";
const STROKE = 9;

function Face({ mouth = "smile" }) {
  const mouths = {
    smile: "M132 117 Q160 142 188 117",
    small: "M147 124 Q160 132 173 124",
    worried: "M144 134 Q160 119 176 134",
    wow: "M160 121 A10 13 0 1 0 160 147 A10 13 0 1 0 160 121",
  };
  return (
    <g className="getdi-character-face">
      <circle cx="130" cy="92" r="8" fill={INK} />
      <circle cx="184" cy="92" r="8" fill={INK} />
      <path d={mouths[mouth]} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
    </g>
  );
}

function Body() {
  return (
    <path
      d="M160 27 C86 30 58 94 64 174 C69 246 97 286 160 290 C217 293 267 273 286 261 C262 239 243 218 243 167 C243 91 225 24 160 27 Z"
      fill="var(--character-fill, #ff7262)"
      stroke={INK}
      strokeWidth={STROKE}
      strokeLinejoin="round"
    />
  );
}

function Limb({ d, front = false }) {
  return <path data-layer={front ? "front" : "back"} d={d} fill="none" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />;
}

function ThinkingPose() {
  return <><Limb d="M92 164 Q47 179 68 215" /><Body /><Face mouth="small" /><Limb front d="M91 174 Q116 166 127 131 L145 142" /><circle cx="219" cy="63" r="5" fill={INK} opacity=".5" /><circle cx="235" cy="45" r="8" fill={INK} opacity=".7" /></>;
}
function PointingPose() {
  return <><Limb d="M89 169 Q45 193 27 167" /><Body /><Face /><Limb front d="M226 159 Q266 134 299 102 M299 102 l-16 1 M299 102 l-9 14" /></>;
}
function ComparingPose() {
  return <><Limb d="M82 167 Q49 151 31 124" /><Limb d="M231 165 Q267 148 291 124" /><Body /><Face mouth="small" /><rect x="16" y="86" width="54" height="38" rx="8" fill="none" stroke={INK} strokeWidth="6" /><rect x="250" y="86" width="54" height="38" rx="8" fill="none" stroke={INK} strokeWidth="6" /><text x="43" y="112" textAnchor="middle" fontSize="20" fontWeight="800" fill={INK}>A</text><text x="277" y="112" textAnchor="middle" fontSize="20" fontWeight="800" fill={INK}>B</text></>;
}
function CheckingPose() {
  return <><Limb d="M89 174 Q52 197 37 223" /><Body /><Face /><Limb front d="M225 166 Q260 152 280 122" /><circle cx="280" cy="96" r="31" fill="var(--character-accent, #ffcf2d)" stroke={INK} strokeWidth="7" /><path d="M263 96 l12 12 22-27" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></>;
}
function WarningPose() {
  return <><Limb d="M91 176 Q53 202 35 230" /><Body /><Face mouth="worried" /><Limb front d="M225 166 Q256 154 272 129" /><path d="M274 66 L307 126 H241 Z" fill="var(--character-accent, #ffcf2d)" stroke={INK} strokeWidth="7" strokeLinejoin="round" /><path d="M274 85 v20 M274 114 v1" stroke={INK} strokeWidth="7" strokeLinecap="round" /></>;
}
function CelebratingPose() {
  return <><Limb d="M91 164 Q58 132 49 82" /><Limb d="M226 161 Q257 126 271 76" /><Body /><Face mouth="wow" /><path d="M38 47 l6 13 M68 39 l-4 15 M281 39 l-6 15 M299 57 l-13 8" stroke="var(--character-accent, #ffcf2d)" strokeWidth="7" strokeLinecap="round" /></>;
}
function ConfusedPose() {
  return <><Limb d="M90 171 Q54 189 37 177" /><Body /><Face mouth="worried" /><Limb front d="M225 170 Q259 190 282 174" /><text x="254" y="92" fontSize="66" fontWeight="900" fill="var(--character-accent, #ffcf2d)" stroke={INK} strokeWidth="2">?</text></>;
}
function ReadingPose() {
  return <><Limb d="M91 174 Q57 201 53 232" /><Limb d="M226 174 Q259 202 264 232" /><Body /><Face mouth="small" /><path d="M76 184 Q119 174 160 203 Q201 174 244 184 V258 Q201 245 160 270 Q119 245 76 258 Z" fill="var(--character-paper, #fff7dc)" stroke={INK} strokeWidth="7" strokeLinejoin="round" /><path d="M160 203 V270" stroke={INK} strokeWidth="6" /></>;
}

const POSE_COMPONENTS = { ThinkingPose, PointingPose, ComparingPose, CheckingPose, WarningPose, CelebratingPose, ConfusedPose, ReadingPose };

function CharacterPose({ pose = "thinking", title, className = "", decorative = false, ...props }) {
  const metadata = CHARACTER_POSES[pose] || CHARACTER_POSES.thinking;
  const Pose = POSE_COMPONENTS[metadata.component];
  const titleId = useId();
  const accessibleTitle = title || metadata.label;
  return (
    <svg className={`getdi-character ${className}`.trim()} viewBox="0 0 320 320" role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-labelledby={decorative ? undefined : titleId} {...props}>
      {!decorative && <title id={titleId}>{accessibleTitle}</title>}
      <Pose />
    </svg>
  );
}

export { CharacterPose, POSE_COMPONENTS };
