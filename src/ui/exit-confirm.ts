// 게임 종료 확인 창 (DOM)
// 앱인토스 게임 출시 체크리스트의 "종료 시 확인 모달"을 위한 창입니다. 최종 디자인 때 시각 언어를 다시 맞춥니다.

export type ExitConfirmOptions = {
  onExit: () => void;
  onCancel?: () => void;
  parent?: HTMLElement;
};

const ROOT_CLASS = 'exit-confirm';

export function isExitConfirmOpen(parent: ParentNode = document) {
  return parent.querySelector(`.${ROOT_CLASS}`) !== null;
}

// 이미 열려 있으면 새로 만들지 않습니다. 반환값은 창을 닫는 함수입니다.
export function showExitConfirm({ onExit, onCancel, parent = document.body }: ExitConfirmOptions): () => void {
  const existing = parent.querySelector<HTMLElement>(`.${ROOT_CLASS}`);
  if (existing) return () => existing.remove();

  const root = document.createElement('div');
  root.className = ROOT_CLASS;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'exit-confirm-title');
  root.innerHTML = `
    <div class="exit-confirm__panel">
      <p id="exit-confirm-title" class="exit-confirm__title">공방 문을 닫을까요?</p>
      <p class="exit-confirm__body">진행 상황은 저장되어 있어요.<br />다음에 이어서 할 수 있어요.</p>
      <div class="exit-confirm__actions">
        <button type="button" class="exit-confirm__button exit-confirm__button--secondary" data-action="cancel">계속하기</button>
        <button type="button" class="exit-confirm__button" data-action="exit">종료</button>
      </div>
    </div>`;

  const close = () => root.remove();
  root.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'exit') { close(); onExit(); return; }
    // 버튼 밖 어두운 영역을 눌러도 계속하기와 같게 처리합니다.
    if (action === 'cancel' || event.target === root) { close(); onCancel?.(); }
  });
  parent.appendChild(root);
  root.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.focus();
  return close;
}
