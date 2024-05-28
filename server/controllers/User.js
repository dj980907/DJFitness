import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createError } from "../error.js";
import User from "../models/User.js";
import Workout from "../models/Workout.js";

dotenv.config();


// this is for when the user signs up
export const UserRegister = async (req, res, next) => {
  try {
    const { email, password, name, img } = req.body;

    // Check if the email is in use
    const existingUser = await User.findOne({ email }).exec();

    // if there is the same email, return error
    if (existingUser) {
      return next(createError(409, "Email is already in use."));
    }

    // create salt and hash the password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    // create the user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      img,
    });

    // save it to the mongodb
    const createdUser = await user.save();
    const token = jwt.sign({ id: createdUser._id }, process.env.JWT, {
      expiresIn: "9999 year",
    });
    // send 200 OK
    return res.status(200).json({ token, user });
  } catch (error) {
    return next(error);
  }
};

// this is when the user logs in
export const UserLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // find the user with email
    const user = await User.findOne({ email: email });

    // Check if user exists
    if (!user) {
      return next(createError(404, "User not found"));
    }
    console.log(user);

    // Check if password is correct
    const isPasswordCorrect = await bcrypt.compareSync(password, user.password);

    // if the password is wrong, then return error
    if (!isPasswordCorrect) {
      return next(createError(403, "Incorrect password"));
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT, {
      expiresIn: "9999 year",
    });

    return res.status(200).json({ token, user });
  } catch (error) {
    return next(error);
  }
};

// function that gets the dashboard 
export const getUserDashboard = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const currentDateFormatted = new Date();
    const startToday = new Date(
      currentDateFormatted.getFullYear(),
      currentDateFormatted.getMonth(),
      currentDateFormatted.getDate()
    );
    const endToday = new Date(
      currentDateFormatted.getFullYear(),
      currentDateFormatted.getMonth(),
      currentDateFormatted.getDate() + 1
    );

    //calculte total calories burnt
    const totalCaloriesBurnt = await Workout.aggregate([
      { $match: { user: user._id, date: { $gte: startToday, $lt: endToday } } },
      {
        $group: {
          _id: null,
          totalCaloriesBurnt: { $sum: "$caloriesBurned" },
        },
      },
    ]);

    //Calculate total no of workouts
    const totalWorkouts = await Workout.countDocuments({
      user: userId,
      date: { $gte: startToday, $lt: endToday },
    });

    //Calculate average calories burnt per workout
    const avgCaloriesBurntPerWorkout =
      totalCaloriesBurnt.length > 0
        ? totalCaloriesBurnt[0].totalCaloriesBurnt / totalWorkouts
        : 0;

    // Fetch category of workouts
    const categoryCalories = await Workout.aggregate([
      { $match: { user: user._id, date: { $gte: startToday, $lt: endToday } } },
      {
        $group: {
          _id: "$category",
          totalCaloriesBurnt: { $sum: "$caloriesBurned" },
        },
      },
    ]);

    //Format category data for pie chart

    const pieChartData = categoryCalories.map((category, index) => ({
      id: index,
      value: category.totalCaloriesBurnt,
      label: category._id,
    }));

    const weeks = [];
    const caloriesBurnt = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(
        currentDateFormatted.getTime() - i * 24 * 60 * 60 * 1000
      );
      weeks.push(`${date.getDate()}th`);

      const startOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      const endOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + 1
      );

      const weekData = await Workout.aggregate([
        {
          $match: {
            user: user._id,
            date: { $gte: startOfDay, $lt: endOfDay },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            totalCaloriesBurnt: { $sum: "$caloriesBurned" },
          },
        },
        {
          $sort: { _id: 1 }, // Sort by date in ascending order
        },
      ]);

      caloriesBurnt.push(
        weekData[0]?.totalCaloriesBurnt ? weekData[0]?.totalCaloriesBurnt : 0
      );
    }

    return res.status(200).json({
      totalCaloriesBurnt:
        totalCaloriesBurnt.length > 0
          ? totalCaloriesBurnt[0].totalCaloriesBurnt
          : 0,
      totalWorkouts: totalWorkouts,
      avgCaloriesBurntPerWorkout: avgCaloriesBurntPerWorkout,
      totalWeeksCaloriesBurnt: {
        weeks: weeks,
        caloriesBurned: caloriesBurnt,
      },
      pieChartData: pieChartData,
    });
  } catch (err) {
    next(err);
  }
};

export const getWorkoutsByDate = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId);
    let date = req.query.date ? new Date(req.query.date) : new Date();
    if (!user) {
      return next(createError(404, "User not found"));
    }
    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    const endOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1
    );

    const todaysWorkouts = await Workout.find({
      userId: userId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });
    const totalCaloriesBurnt = todaysWorkouts.reduce(
      (total, workout) => total + workout.caloriesBurned,
      0
    );

    return res.status(200).json({ todaysWorkouts, totalCaloriesBurnt });
  } catch (err) {
    next(err);
  }
};

// THIS IS THE ORIGINAL
export const addWorkout = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { workoutString } = req.body;
    if (!workoutString) {
      return next(createError(400, "Workout string is missing"));
    }
    // Split workoutString into lines
    const eachworkout = workoutString.split(";").map((line) => line.trim());
    // Check if any workouts start with "#" to indicate categories
    const categories = eachworkout.filter((line) => line.startsWith("#"));
    if (categories.length === 0) {
      return next(createError(400, "No categories found in workout string"));
    }

    const parsedWorkouts = [];
    let currentCategory = "";
    let count = 0;

    // Loop through each line to parse workout details
    await eachworkout.forEach((line) => {
      count++;
      if (line.startsWith("#")) {
        const parts = line?.split("\n").map((part) => part.trim());
        // console.log("this is the part: ",parts);
        if (parts.length < 5) {
          return next(
            createError(400, `Workout string is missing for ${count}th workout`)
          );
        }

        console.log("this is parts: ", parts);
        // Update current category
        currentCategory = parts[0].substring(1).trim();
        console.log("this is parts: ", parts);
        // Extract workout details
        const workoutDetails = parseWorkoutLine(parts);
        if (workoutDetails == null) {
          return next(createError(400, "Please enter in proper format "));
        }

        if (workoutDetails) {
          // Add category to workout details
          workoutDetails.category = currentCategory;
          parsedWorkouts.push(workoutDetails);
        }
      } else {
        return next(
          createError(400, `Workout string is missing for ${count}th workout`)
        );
      }
    });


    console.log(parsedWorkouts);
    // // Calculate calories burnt for each workout
    // await parsedWorkouts.forEach(async (workout) => {
    //   workout.caloriesBurned = parseFloat(calculateCaloriesBurnt(workout));
    //   await Workout.create({ ...workout, user: userId });
    // });

    // return res.status(201).json({
    //   message: "Workouts added successfully",
    //   workouts: parsedWorkouts,
    // });

    // Check for duplicates and insert or update accordingly
    for (const workout of parsedWorkouts) {
      const existingWorkout = await Workout.findOne({
        workoutName: workout.workoutName,
        user: userId,
      });
      if (existingWorkout) {
        workout.caloriesBurned = parseFloat(calculateCaloriesBurnt(workout));
        // Update existing workout
        await Workout.updateOne(
          { _id: existingWorkout._id },
          { $set: workout }
        );
      } else {
        // Calculate calories burnt for each workout
        workout.caloriesBurned = parseFloat(calculateCaloriesBurnt(workout));
        await Workout.create({ ...workout, user: userId });
      }
    }

    return res.status(201).json({
      message: "Workouts added successfully",
      workouts: parsedWorkouts,
    });




  } catch (err) {
    next(err);
  }
};

// Function to parse workout details from a line
const parseWorkoutLine = (parts) => {
  const details = {};
  // console.log(parts);
  if (parts.length >= 5) {
    details.workoutName = parts[1].substring(1).trim();
    details.sets = parseInt(parts[2].split("sets")[0].substring(1).trim());
    details.reps = parseInt(
      parts[2].split("sets")[1].split("reps")[0].substring(1).trim()
    );
    details.weight = parseFloat(parts[3].split("kg")[0].substring(1).trim());
    details.duration = parseFloat(parts[4].split("min")[0].substring(1).trim());
    console.log("this is the details of the added workout: ",details);
    return details;
  }
  return null;
};

// Function to calculate calories burnt for a workout
const calculateCaloriesBurnt = (workoutDetails) => {
  const durationInMinutes = parseInt(workoutDetails.duration);
  const weightInKg = parseInt(workoutDetails.weight);
  const caloriesBurntPerMinute = 5; // Sample value, actual calculation may vary
  // return durationInMinutes * caloriesBurntPerMinute;
  return durationInMinutes * weightInKg / 10;
};





// export const addWorkout = async (req, res, next) => {
//   try {
//     const userId = req.user?.id;
//     const { workoutString } = req.body;
//     if (!workoutString) {
//       return next(createError(400, "Workout string is missing"));
//     }

//     const eachworkout = workoutString.split(";").map((line) => line.trim());
//     const categories = eachworkout.filter((line) => line.startsWith("#"));
//     if (categories.length === 0) {
//       return next(createError(400, "No categories found in workout string"));
//     }

//     const parsedWorkouts = [];
//     let currentCategory = "";
//     let count = 0;

//     await eachworkout.forEach((line) => {
//       count++;
//       if (line.startsWith("#")) {
//         const parts = line?.split("\n").map((part) => part.trim());
//         if (parts.length < 5) {
//           return next(
//             createError(400, `Workout string is missing for ${count}th workout`)
//           );
//         }
//         currentCategory = parts[0].substring(1).trim();
//         const workoutDetails = parseWorkoutLine(parts);
//         if (workoutDetails == null) {
//           return next(createError(400, "Please enter in proper format "));
//         }
//         if (workoutDetails) {
//           workoutDetails.category = currentCategory;
//           parsedWorkouts.push(workoutDetails);
//         }
//       } else {
//         return next(
//           createError(400, `Workout string is missing for ${count}th workout`)
//         );
//       }
//     });

//     await Promise.all(
//       parsedWorkouts.map(async (workout) => {
//         workout.caloriesBurned = parseFloat(calculateCaloriesBurnt(workout));
//         await Workout.create({ ...workout, user: userId });
//       })
//     );

//     return res.status(201).json({
//       message: "Workouts added successfully",
//       workouts: parsedWorkouts,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

// // Function to parse workout details from a line
// const parseWorkoutLine = (parts) => {
//   const details = {};
//   if (parts.length >= 5) {
//     details.workoutName = parts[1].substring(1).trim();
//     details.sets = parseInt(parts[2].split("sets")[0].substring(1).trim());
//     details.reps = parseInt(
//       parts[2].split("sets")[1].split("reps")[0].substring(1).trim()
//     );
//     details.weight = parseFloat(parts[3].split("kg")[0].substring(1).trim());
//     details.duration = parseFloat(parts[4].split("min")[0].substring(1).trim());
//     return details;
//   }
//   return null;
// };

// // Function to calculate calories burnt for a workout
// const calculateCaloriesBurnt = (workoutDetails) => {
//   const durationInMinutes = parseInt(workoutDetails.duration);
//   const weightInKg = parseInt(workoutDetails.weight);
//   const caloriesBurntPerMinute = 5; // Sample value, actual calculation may vary
//   return durationInMinutes * caloriesBurntPerMinute * weightInKg;
// };