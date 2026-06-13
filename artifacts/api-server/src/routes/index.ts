import { Router, type IRouter } from "express";
import healthRouter from "./health";
import copilotRouter from "./copilot";
import routeRouter from "./route";
import executePaymentRouter from "./execute-payment";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(copilotRouter);
router.use(routeRouter);
router.use(executePaymentRouter);
router.use(agentRouter);

export default router;
