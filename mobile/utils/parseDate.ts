const parseDate = (dateString: string) => {
  const [day, month, year] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day);
};

const getMonthName = (monthIndex: number) => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[monthIndex];
};

export { parseDate, getMonthName };
