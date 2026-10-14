import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import StudentSubmit from "./pages/StudentSubmit";
import AdminTests from "./pages/AdminTests";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentSubmit />} />
        <Route path="/admin" element={<AdminTests />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
