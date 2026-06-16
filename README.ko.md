# Quick Look 3D Plugin

[English](./README.md) | [日本語](./README.ja.md) | **한국어**

macOS의 Quick Look에서 **`.vrm` / `.vrma` / `.glb` / `.fbx`** 파일을 3D로 미리 보는 플러그인입니다.

Finder에서 파일을 선택하고 스페이스바를 누르면 모델을 빙글빙글 돌려 확인할 수 있습니다.
애니메이션이 포함되어 있으면 자동으로 재생됩니다.

![Quick Look 3D demo](docs/demo.gif)

## 설치

1. [최신 릴리스](https://github.com/sawa-zen/quick-look-3d/releases/latest)에서
   `QuickLook3D.dmg`를 내려받아 엽니다
2. **QuickLook3D.app**을 응용 프로그램 폴더로 드래그합니다
3. **앱을 한 번 실행합니다** — 이것으로 Quick Look 확장이 macOS에 등록됩니다
   (창은 닫아도 됩니다)
4. **시스템 설정 → 일반 → 로그인 항목 및 확장 프로그램 → 확장 프로그램(Quick Look)**을 열고
   **Quick Look 3D**를 켭니다

> 배포본은 Apple의 공증(Notarization)을 받았으므로 Gatekeeper 경고가 표시되지 않습니다.

## 사용법

Finder에서 지원 파일을 선택하고 **스페이스바**를 누릅니다 (또는 우클릭 → 미리 보기).

| 형식 | 설명 |
|---|---|
| `.vrm` | VRM 아바타 (0.x / 1.0) |
| `.vrma` | VRM 애니메이션. 메시가 없으므로 스켈레톤으로 표시되며 애니메이션이 재생됩니다 |
| `.glb` | glTF 바이너리. 포함된 애니메이션이 있으면 재생됩니다 |
| `.fbx` | FBX 모델. 포함된 애니메이션이 있으면 재생됩니다 |

- 드래그로 회전, 스크롤로 확대/축소
- 메시(스킨)가 없는 `.fbx`나 `.vrma`는 스켈레톤으로 표시됩니다

## 문제 해결

- 설치 3~4단계(**한 번 실행** 및 **확장 프로그램 켜기**)를 마쳤는지 확인하세요
- 그래도 안 되면 Quick Look 캐시를 새로 고칩니다:
  ```bash
  qlmanage -r && qlmanage -r cache
  ```
- `.gltf`(외부 `.bin`/텍스처가 분리된 멀티 파일 형식)는 지원하지 않습니다.
  단일 파일인 `.glb`를 사용하세요.

## 라이선스

프로젝트 코드는 [MIT](./LICENSE)입니다. 함께 포함되는 서드파티(three.js /
@pixiv/three-vrm / fflate)도 MIT이며, 자세한 내용은
[THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)를 참고하세요. 아바타 등 모델
데이터는 포함하지 않습니다.

## 개발자용

빌드 방법, 아키텍처, 배포(서명/공증) 절차는
**[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)**를 참고하세요.
