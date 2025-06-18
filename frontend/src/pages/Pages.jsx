import { Routes, Route, Navigate } from "react-router";
import Login from "./Auth/Login.jsx";
import IDE from "./IDE.jsx";

const Pages = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/IDE" element={<IDE />} />
      <Route path="/*" element={<Login />} />
    </Routes>
  );
};

export default Pages;