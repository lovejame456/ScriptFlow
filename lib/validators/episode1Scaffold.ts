export function validateEpisode1Scaffold(structured: any) {
  const roles = structured?.sceneRoles;
  
  // Check if sceneRoles exists and is array
  if (!Array.isArray(roles)) {
      return { passed: false, errors: ["MISSING_SCENE_ROLES"] };
  }

  // Strict scaffold for Episode 1: Incident -> Pressure -> Hook
  const required = ["INCIDENT", "PRESSURE", "HOOK"];

  // Strict check: must contain all three required roles
  const ok = roles.length >= 3 &&
             roles.some(r => r.includes("INCIDENT")) &&
             roles.some(r => r.includes("PRESSURE")) &&
             roles.some(r => r.includes("HOOK"));

  return { 
      passed: ok, 
      errors: ok ? [] : [`EP1_SCAFFOLD_INVALID: Expected ${required.join(', ')}, got ${roles.join(', ')}`] 
  };
}