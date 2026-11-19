export const formatDate = (inputDate: any) => {
  try {
    if (!inputDate) {
      return new Date().toISOString().split("T")[0];
    }

    // Handle Date object
    if (inputDate instanceof Date) {
      const day = String(inputDate.getDate()).padStart(2, "0");
      const month = String(inputDate.getMonth() + 1).padStart(2, "0");
      const year = inputDate.getFullYear();
      return `${day}-${month}-${year}`;
    }

    // Handle string input
    if (typeof inputDate === "string") {
      const datePart = inputDate.split(",")[0];
      const [month, day, year] = datePart.split("/");

      if (month && day && year) {
        return `${day}-${month}-${year}`;
      }
    }

    // Fallback to current date
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    // Return current date as fallback
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
  }
};
