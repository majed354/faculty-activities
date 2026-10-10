export function normalizeEmployeeId(value) {
  const digits = String(value ?? '').normalize('NFKC').trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  return /^\d{1,12}$/.test(digits) ? digits : '';
}

export function matchesEmployeeId(value, expected) {
  const entered = normalizeEmployeeId(value);
  return !!entered && entered === normalizeEmployeeId(expected);
}

let pending = null;

export function cancelCvConfirmation() { pending?.finish(false, false); }

export function confirmCvMembers(members) {
  cancelCvConfirmation();
  if (!members.length || members.some(member => !member || !normalizeEmployeeId(member.id))) return Promise.resolve(false);
  const returnFocus = document.activeElement;
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.id = 'cvMemberAccessModal'; modal.className = 'modal active';
    modal.innerHTML = `<div class="modal-content cv-session-dialog cv-member-access-dialog" role="dialog" aria-modal="true" aria-labelledby="cvMemberAccessTitle" aria-describedby="cvMemberAccessHelp">
      <h3 id="cvMemberAccessTitle">فتح سيرة العضو</h3><p id="cvMemberAccessName"></p><p id="cvMemberAccessProgress"></p>
      <p id="cvMemberAccessHelp">أدخل الرقم الوظيفي للعضو المختار بالأرقام العربية أو الإنجليزية.</p>
      <form novalidate><label for="cvMemberAccessId">الرقم الوظيفي</label><input id="cvMemberAccessId" class="form-input" type="text" inputmode="numeric" autocomplete="off" maxlength="12" dir="ltr" aria-describedby="cvMemberAccessError">
      <p id="cvMemberAccessError" class="cv-form-error" role="alert"></p><div class="cv-dialog-actions"><button type="button" data-cancel-access>إلغاء</button><button type="submit" class="cv-primary" id="cvMemberAccessSubmit">فتح السيرة</button></div></form></div>`;
    let index = 0;
    const input = modal.querySelector('#cvMemberAccessId');
    const error = modal.querySelector('#cvMemberAccessError');
    const state = { finish(ok, restoreFocus = true) {
      if (pending !== state) return;
      pending = null; modal.remove();
      if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      resolve(ok);
    } };
    pending = state;
    const showMember = () => {
      modal.querySelector('#cvMemberAccessName').textContent = members[index].name;
      modal.querySelector('#cvMemberAccessProgress').textContent = members.length > 1 ? `العضو ${(index + 1).toLocaleString('ar-SA')} من ${members.length.toLocaleString('ar-SA')}` : '';
      modal.querySelector('#cvMemberAccessSubmit').textContent = index < members.length - 1 ? 'تأكيد والمتابعة' : members.length > 1 ? 'عرض السير' : 'فتح السيرة';
      input.value = ''; input.removeAttribute('aria-invalid'); error.textContent = ''; input.focus();
    };
    modal.querySelector('[data-cancel-access]').onclick = () => state.finish(false);
    modal.onclick = event => { if (event.target === modal) state.finish(false); };
    modal.querySelector('form').onsubmit = event => {
      event.preventDefault();
      if (!matchesEmployeeId(input.value, members[index].id)) {
        error.textContent = input.value.trim() ? 'الرقم الوظيفي لا يطابق العضو المختار. أعد إدخاله.' : 'أدخل الرقم الوظيفي للعضو المختار.';
        input.setAttribute('aria-invalid', 'true'); input.focus(); input.select(); return;
      }
      index += 1;
      if (index === members.length) state.finish(true);
      else showMember();
    };
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); state.finish(false); }
      if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('input,button')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    document.body.appendChild(modal); showMember();
  });
}
