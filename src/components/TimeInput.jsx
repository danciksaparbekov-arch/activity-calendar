import { useEffect, useRef, useState } from 'react';
import { parseTime } from '../lib/dates';

// Поле для ввода времени в 24-часовом формате (23, 18:30, 1830).
// value / onChange — строка 'HH:MM'; пока ввод некорректен, наружу уходит '' и форма не отправится.
export default function TimeInput({ value, onChange, label }) {
  const [text, setText] = useState(value || '');
  const ref = useRef(null);

  // значение пришло снаружи (например, подгрузилось при редактировании) — показать его
  useEffect(() => {
    if (value && parseTime(text) !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // встроенная проверка формы: сообщение и блокировка отправки
  useEffect(() => {
    ref.current?.setCustomValidity(parseTime(text) ? '' : 'Введите время, например 23 или 18:30');
  }, [text]);

  function handleChange(e) {
    setText(e.target.value);
    onChange(parseTime(e.target.value) || '');
  }

  // при уходе из поля приводим к виду ЧЧ:ММ
  function handleBlur() {
    const t = parseTime(text);
    if (t) setText(t);
  }

  return (
    <label>
      {label}
      <input
        ref={ref}
        className="time-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="18:30"
        maxLength={5}
        required
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </label>
  );
}
