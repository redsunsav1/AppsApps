// Рельеф: цвета биомов с плавными переходами (интерполяция вершин), освещение склонов,
// анимированные каустики и подводный тинт.
export const terrainVertex = /* glsl */ `
in vec2 aPosition;
in vec3 aColor;
in vec2 aWorld;
in vec2 aParams;

out vec3 vColor;
out vec2 vWorld;
out vec2 vParams;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vColor = aColor;
  vWorld = aWorld;
  vParams = aParams;
}
`;

export const terrainFragment = /* glsl */ `
in vec3 vColor;
in vec2 vWorld;
in vec2 vParams;

out vec4 finalColor;

uniform float uTime;
uniform float uCaustics;
uniform vec3 uTint;

#define TAU 6.28318530718

float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 col = vColor * vParams.y;
  // зерно грунта
  float grain = hash(floor(vWorld * 6.0)) * 0.06 - 0.03;
  col += grain;
  float c = caustic(vWorld / 7.0, uTime * 0.35) * 0.6 + caustic(vWorld / 3.3 + 0.37, uTime * 0.5) * 0.4;
  col += vec3(0.45, 0.85, 0.9) * c * vParams.x * uCaustics;
  col = mix(col, uTint, 0.28);
  finalColor = vec4(col, 1.0);
}
`;
